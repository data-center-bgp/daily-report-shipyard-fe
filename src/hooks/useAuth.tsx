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
  
  // FIXED: Use ref to track if initial load is complete
  const isInitializing = useRef(true);
  const isMounted = useRef(true);

  // FIXED: Stable fetchProfile with proper timeout
  const fetchProfile = useCallback(
    async (userId: string, retryCount = 0): Promise<UserProfile | null> => {
      const MAX_RETRIES = 3;
      const TIMEOUT_MS = 10000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        console.log(`🔄 Fetching profile for user: ${userId} (attempt ${retryCount + 1})`);

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
            await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchProfile(userId, retryCount + 1);
          }

          return null;
        }

        console.log("✅ Profile fetched successfully:", data?.email);
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("💥 Profile fetch exception:", err);

        if (err instanceof Error && err.name === "AbortError") {
          console.error("⏱️ Profile fetch timed out");
        }

        if (retryCount < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
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

  // FIXED: Simplified initialization without race conditions
  useEffect(() => {
    isMounted.current = true;

    const initAuth = async () => {
      try {
        console.log("🔐 Initializing auth...");

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

        console.log("📋 Session status:", session ? "Active" : "None");

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const userProfile = await fetchProfile(session.user.id);

          if (!isMounted.current) return;

          if (!userProfile) {
            console.warn("⚠️ No profile found, signing out");
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
          console.log("✅ Auth initialization complete");
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

    // FIXED: Simplified auth listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted.current) return;
      
      // Skip during initialization
      if (isInitializing.current) {
        console.log("⏭️ Skipping auth change during init:", event);
        return;
      }

      console.log("🔔 Auth state changed:", event);

      setSession(session);
      setUser(session?.user ?? null);

      if (event === "SIGNED_IN" && session?.user) {
        const userProfile = await fetchProfile(session.user.id);

        if (!isMounted.current) return;

        if (!userProfile) {
          console.warn("⚠️ No profile found after sign in");
          await supabase.auth.signOut();
          setProfile(null);
          return;
        }

        setProfile(userProfile);
      } else if (event === "SIGNED_OUT" || !session?.user) {
        setProfile(null);
      }

      if (isMounted.current) {
        setLoading(false);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
      console.log("🧹 Auth cleanup");
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}