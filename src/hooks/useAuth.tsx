/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
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
  role: "MASTER" | "PPIC" | "PRODUCTION" | "OPERATION" | "ADMIN" | "FINANCE";
  auth_user_id: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ user: User | null; profile: UserProfile | null; error: any }>;
  signOut: () => Promise<void>;
  hasRole: (roles: string | string[]) => boolean;
  canAccess: (feature: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Role → feature mapping
const FEATURE_ACCESS = {
  dashboard: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN", "FINANCE"],
  workOrders: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  workDetails: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  progress: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  vessels: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  invoices: ["MASTER", "FINANCE"],
  createInvoice: ["MASTER", "FINANCE"],
  editInvoice: ["MASTER", "FINANCE"],
  userManagement: ["MASTER"],
  systemSettings: ["MASTER"],
  reports: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN", "FINANCE"],
  exportData: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Simplified profile fetch without the heavy debugging (for production use)
  const fetchProfile = useCallback(
    async (userId: string, retryCount = 0): Promise<UserProfile | null> => {
      const MAX_RETRIES = 3;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("auth_user_id", userId)
          .is("deleted_at", null)
          .single();

        if (error) {
          console.error("❌ Profile fetch error:", error.message);

          // If it's a connection/auth error and we haven't exceeded retries
          if (
            retryCount < MAX_RETRIES &&
            (error.message.includes("JWT") ||
              error.message.includes("auth") ||
              error.message.includes("network") ||
              error.code === "PGRST301")
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return fetchProfile(userId, retryCount + 1);
          }

          return null;
        }

        return data;
      } catch (err) {
        console.error("💥 Profile fetch exception:", err);

        // Retry on exceptions too
        if (retryCount < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return fetchProfile(userId, retryCount + 1);
        }

        return null;
      }
    },
    []
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

  // Enhanced initialization with proper session waiting
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("❌ Session fetch error:", error);
          if (mounted) {
            setLoading(false);
            setInitialized(true);
          }
          return;
        }

        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await new Promise((resolve) => setTimeout(resolve, 100));

          const userProfile = await fetchProfile(session.user.id);

          if (!mounted) return;

          if (!userProfile) {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
          } else {
            setProfile(userProfile);
          }
        }

        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      } catch (err) {
        console.error("💥 Auth init error:", err);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initAuth();

    // Enhanced auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Only process events after initial load is complete
      if (!initialized) {
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user && event === "SIGNED_IN") {
        const userProfile = await fetchProfile(session.user.id);

        if (!mounted) return;

        if (!userProfile) {
          await supabase.auth.signOut();
          return;
        }

        setProfile(userProfile);
      } else if (!session?.user) {
        setProfile(null);
      }

      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialized, fetchProfile]);

  // Debug logging
  useEffect(() => {}, [loading, initialized, user, profile]);

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
