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
  // Hendra Muzaki (PPIC — acting as PPIC Manager) can review work verification
  // for vessels outside our own fleet (vessel.fleet_number is null), since
  // OP_HEAD's coverage doesn't extend to them. Scoped to this one person by
  // id, not by role — PPIC otherwise has no verification access at all.
  canVerifyExternalVesselWork: boolean;
  // Work Order "Docking Planning" (Docking/Floating/Vessel on Dock/
  // Undocking schedule estimate): viewable by anyone who can already see
  // Work Orders, but only MASTER/PPIC/ADMIN_SHIPPING can add/edit/remove
  // entries — mirrored by RLS on work_order_general_services, not just
  // this client-side check.
  canManageDockingPlanning: boolean;
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
  // MANAGER gets the same view access as MASTER everywhere (see isReadOnly),
  // including here — UserManagementPage.tsx gates the actual write controls
  // (role change, deactivate/reactivate) behind isReadOnly separately, so
  // this only grants MANAGER visibility into the user list, not the ability
  // to change anything.
  userManagement: ["MASTER", "MANAGER"],
  systemSettings: ["MASTER", "MANAGER"],
  // MANAGER gets view-only access here too (see isReadOnly) — actual
  // writes (add/edit/soft-delete) are MASTER/PPIC only, matching the RLS
  // policies on vessel/location/work_scope.
  masterData: ["MASTER", "PPIC", "MANAGER"],
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
  // Separate from exportData so ADMIN_SHIPPING gets Import (its create-only
  // scope covers bulk-creating work orders/details) without also gaining
  // Export Data, which it was never meant to have.
  importData: [
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OP_HEAD",
    "ADMIN",
    "MANAGER",
    "ADMIN_SHIPPING",
  ],
  activityLogs: ["MASTER", "MANAGER"],
  additionalWoApprovals: ["MASTER", "OP_HEAD", "MANAGER"],
  readinessQueue: ["MASTER", "HSSE", "MANAGER"],
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
  // ADMIN_SHIPPING exists to CREATE Projects/Work Orders/Work Details, and
  // was meant to never edit or delete one afterward (that's PPIC's job).
  // TEMPORARY: while the ADMIN_SHIPPING workflow is still being established,
  // that restriction is switched off below — this role gets full edit/
  // delete on Work Orders/Work Details too, same as PPIC, no separate UI.
  // Once the workflow is stable, flip SHIPPING_CREATE_ONLY_ENABLED back to
  // `true` to restore it — every consumer of isShippingCreateOnly (badges,
  // banners, redirects) already keys off this one flag.
  const SHIPPING_CREATE_ONLY_ENABLED = false;
  const isShippingCreateOnly =
    SHIPPING_CREATE_ONLY_ENABLED && profile?.role === "ADMIN_SHIPPING";

  // See canVerifyExternalVesselWork above — matched on both id and
  // auth_user_id so this doesn't silently transfer if id 63 is ever reused.
  const EXTERNAL_VESSEL_VERIFIER_PROFILE_ID = 63;
  const EXTERNAL_VESSEL_VERIFIER_AUTH_USER_ID =
    "5d884b47-bb53-48ac-8d58-ee1d7f57451f";
  const canVerifyExternalVesselWork =
    profile?.id === EXTERNAL_VESSEL_VERIFIER_PROFILE_ID &&
    profile?.auth_user_id === EXTERNAL_VESSEL_VERIFIER_AUTH_USER_ID;

  const canManageDockingPlanning =
    profile?.role === "MASTER" ||
    profile?.role === "PPIC" ||
    profile?.role === "ADMIN_SHIPPING";

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
        canVerifyExternalVesselWork,
        canManageDockingPlanning,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
