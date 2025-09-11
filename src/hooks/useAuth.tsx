import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: number;
  auth_user_id: string;
  email: string;
  full_name?: string;
  name?: string;
  role: "MASTER" | "PPIC" | "PRODUCTION" | "OPERATION" | "ADMIN" | "FINANCE";
  created_at?: string;
  updated_at?: string;
  department?: string;
  phone?: string;
  status?: "active" | "inactive";
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
  // Simplified role checks
  hasRole: (roles: string | string[]) => boolean;
  canAccess: (feature: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Simple feature access rules
const FEATURE_ACCESS = {
  // Features that all authenticated users can access
  dashboard: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN", "FINANCE"],
  workOrders: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  workDetails: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  progress: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
  vessels: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],

  // Invoice features - only MASTER and FINANCE
  invoices: ["MASTER", "FINANCE"],
  createInvoice: ["MASTER", "FINANCE"],
  editInvoice: ["MASTER", "FINANCE"],

  // Admin features - only MASTER
  userManagement: ["MASTER"],
  systemSettings: ["MASTER"],

  // Reports - everyone can view, but different levels
  reports: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN", "FINANCE"],
  exportData: ["MASTER", "PPIC", "PRODUCTION", "OPERATION", "ADMIN"],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Simplified profile fetch with better error handling
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", userId)
        .single();

      if (error) {
        console.error("Profile fetch error:", error);
        // Return a default profile instead of null to prevent crashes
        return {
          id: 0,
          auth_user_id: userId,
          email: user?.email || "",
          role: "OPERATION", // Safe default
          status: "active",
        } as UserProfile;
      }

      return data;
    } catch (err) {
      console.error("Profile fetch exception:", err);
      // Return default profile on any error
      return {
        id: 0,
        auth_user_id: userId,
        email: user?.email || "",
        role: "OPERATION",
        status: "active",
      } as UserProfile;
    }
  };

  // Simplified sign in
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { user: null, profile: null, error };
      }

      // Always return success, profile will be loaded async
      return { user: data.user, profile: null, error: null };
    } catch (err) {
      return { user: null, profile: null, error: err };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  // Simple role check - returns false if no profile instead of crashing
  const hasRole = (roles: string | string[]): boolean => {
    if (!profile) return false;
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    return rolesArray.includes(profile.role);
  };

  // Simple feature access check
  const canAccess = (feature: string): boolean => {
    if (!profile) return false;
    const allowedRoles = FEATURE_ACCESS[feature as keyof typeof FEATURE_ACCESS];
    return allowedRoles ? allowedRoles.includes(profile.role) : false;
  };

  // Initialize auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile);
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const userProfile = await fetchProfile(session.user.id);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signOut,
    hasRole,
    canAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
