/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useRef,
} from "react";
import { supabase } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  name: string;
  email: string;
  company: string;
  role:
    | "MASTER"
    | "PPIC"
    | "PRODUCTION"
    | "OP_HEAD"
    | "ADMIN"
    | "FINANCE"
    | "MANAGER"
    | "HSSE"
    | "ADMIN_SHIPPING";
  auth_user_id: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ user: User | null; profile: UserProfile | null; error: any }>;
  signOut: () => Promise<void>;
  hasRole: (roles: string | string[]) => boolean;
  canAccess: (feature: string) => boolean;
  isReadOnly: boolean; // NEW: Simple read-only flag
  // MANAGER (isReadOnly) everywhere, PLUS HSSE and OP_HEAD on Projects/Work
  // Orders/Work Details/Progress specifically. Kept separate from isReadOnly
  // because HSSE (Readiness Form) and OP_HEAD (Work Verification, Additional
  // WO Approvals) each still have full write access to their own feature.
  isOperationsReadOnly: boolean;
  // MANAGER (isReadOnly) everywhere, PLUS FINANCE and OP_HEAD on BASTP
  // composition/materials specifically — both can view but never edit.
  isBastpReadOnly: boolean;
  // ADMIN_SHIPPING only — can create Projects/Work Orders/Work Details but
  // never edit or delete one. Does not affect Add/Create visibility.
  isShippingCreateOnly: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

const FEATURE_ACCESS = {
  dashboard: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "FINANCE",
    "MANAGER",
    "HSSE",
    "ADMIN_SHIPPING",
  ],
  // ADMIN_SHIPPING creates Projects/Work Orders/Work Details only — it
  // never gets Progress, and everywhere it does appear it can create but
  // never edit/delete (see isShippingCreateOnly).
  workOrders: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "MANAGER",
    "HSSE",
    "ADMIN_SHIPPING",
  ],
  workDetails: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "MANAGER",
    "HSSE",
    "ADMIN_SHIPPING",
  ],
  progress: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "MANAGER",
    "HSSE",
  ],
  // Verification is OP_HEAD's job specifically (the fleet/vessel
  // coordinator) — MASTER/MANAGER keep read-only visibility like everywhere
  // else, but PPIC/PRODUCTION/ADMIN no longer see or act on this page.
  verification: ["MASTER", "OP_HEAD", "MANAGER"],
  bastp: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "FINANCE",
    "MANAGER",
  ],
  vessels: ["MASTER", "PPIC", "PRODUCTION", "OP_HEAD", "ADMIN", "MANAGER"],
  invoices: ["MASTER", "FINANCE", "MANAGER"],
  userManagement: ["MASTER"],
  systemSettings: ["MASTER"],
  reports: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "FINANCE",
    "MANAGER",
  ],
  exportData: ["MASTER", "PPIC", "PRODUCTION", "OP_HEAD", "ADMIN", "MANAGER"],
  activityLogs: ["MASTER", "MANAGER"],
  additionalWoApprovals: ["MASTER", "OP_HEAD", "MANAGER"],
  readinessQueue: ["MASTER", "HSSE"],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isInitializing = useRef(true);
  const isMounted = useRef(true);

  // NEW: Compute read-only status
  const isReadOnly = profile?.role === "MANAGER";
  // HSSE and OP_HEAD can view Projects/Work Orders/Work Details/Progress, but
  // should never write there. OP_HEAD's actual write privileges (Work
  // Verification, Additional WO Approvals) live in those pages' own role
  // checks and don't consume this flag, so they're unaffected. HSSE's write
  // privilege (the Readiness Form) is the same story.
  const isOperationsReadOnly =
    isReadOnly || profile?.role === "HSSE" || profile?.role === "OP_HEAD";
  // BASTP composition/materials: FINANCE and OP_HEAD can view (BASTP is on
  // OP_HEAD's "monitor up to BASTP" path) but never edit, on top of
  // MANAGER's blanket isReadOnly. Kept separate from isOperationsReadOnly
  // since FINANCE has no access to Projects/Work Orders/Details/Progress at
  // all, so lumping it into that flag would be meaningless there.
  const isBastpReadOnly =
    isReadOnly || profile?.role === "FINANCE" || profile?.role === "OP_HEAD";
  // ADMIN_SHIPPING exists to CREATE Projects/Work Orders/Work Details — it
  // must never edit or delete one afterward. Distinct from
  // isOperationsReadOnly (which also hides the Add/Create entry points,
  // wrong for this role) — this flag only gates edit/delete surfaces.
  const isShippingCreateOnly = profile?.role === "ADMIN_SHIPPING";

  const fetchProfile = useCallback(
    async (userId: string, retryCount = 0): Promise<UserProfile | null> => {
      const MAX_RETRIES = 3;
      const TIMEOUT_MS = 10000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("auth_user_id", userId)
          .is("deleted_at", null)
          .abortSignal(controller.signal)
          .single();

        clearTimeout(timeoutId);

        if (error) {
          console.error("❌ Profile fetch error:", error.message);

          if (
            retryCount < MAX_RETRIES &&
            (error.message.includes("JWT") ||
              error.message.includes("auth") ||
              error.message.includes("network") ||
              error.code === "PGRST301")
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (retryCount + 1)),
            );
            return fetchProfile(userId, retryCount + 1);
          }

          return null;
        }

        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("💥 Profile fetch exception:", err);

        if (err instanceof Error && err.name === "AbortError") {
          console.error("⏱️ Profile fetch timed out");
        }

        if (retryCount < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (retryCount + 1)),
          );
          return fetchProfile(userId, retryCount + 1);
        }

        return null;
      }
    },
    [],
  );

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Auth error:", error);
        return { user: null, profile: null, error };
      }

      setUser(data.user);
      setSession(data.session);

      const userProfile = await fetchProfile(data.user.id);

      if (!userProfile) {
        await supabase.auth.signOut();
        return {
          user: null,
          profile: null,
          error: {
            message:
              "Access denied. You don't have permission to access this system.",
          },
        };
      }

      setProfile(userProfile);
      setLoading(false);

      return { user: data.user, profile: userProfile, error: null };
    } catch (err) {
      console.error("💥 SignIn exception:", err);
      setLoading(false);
      return { user: null, profile: null, error: err };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const hasRole = (roles: string | string[]) => {
    if (!profile) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    return list.includes(profile.role);
  };

  const canAccess = (feature: string) => {
    if (!profile) return false;
    const allowedRoles = FEATURE_ACCESS[feature as keyof typeof FEATURE_ACCESS];
    return allowedRoles?.includes(profile.role) ?? false;
  };

  useEffect(() => {
    isMounted.current = true;

    const initAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("❌ Session fetch error:", error);
          if (isMounted.current) {
            setLoading(false);
            isInitializing.current = false;
          }
          return;
        }

        if (!isMounted.current) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const userProfile = await fetchProfile(session.user.id);

          if (!isMounted.current) return;

          if (!userProfile) {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
          } else {
            setProfile(userProfile);
          }
        }

        if (isMounted.current) {
          setLoading(false);
          isInitializing.current = false;
        }
      } catch (err) {
        console.error("💥 Auth init error:", err);
        if (isMounted.current) {
          setLoading(false);
          isInitializing.current = false;
        }
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted.current) return;

      if (isInitializing.current) {
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        setSession(session);
        setUser(session?.user ?? null);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (event === "SIGNED_OUT" || !session?.user) {
        setProfile(null);
      }

      if (isMounted.current) {
        setLoading(false);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signOut,
        hasRole,
        canAccess,
        isReadOnly, // NEW: Expose read-only flag
        isOperationsReadOnly,
        isBastpReadOnly,
        isShippingCreateOnly,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
