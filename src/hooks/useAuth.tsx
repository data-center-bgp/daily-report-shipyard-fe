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
  hasRole: (roles: string | string[]) => boolean;
  hasPermission: (permission: string) => boolean;
  isMaster: boolean;
  isFullAccess: boolean; // MASTER, PPIC, PRODUCTION, OPERATION, ADMIN
  isFinance: boolean;
  canAccessInvoices: boolean;
  canEditInvoices: boolean;
  canCreateWorkOrders: boolean;
  canEditWorkOrders: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Enhanced Role-based permissions mapping
const ROLE_PERMISSIONS = {
  MASTER: [
    // Complete system access - no restrictions
    "manage_users",
    "manage_vessels",
    "manage_work_orders",
    "create_work_orders",
    "edit_work_orders",
    "delete_work_orders",
    "view_all_reports",
    "export_data",
    "manage_invoices",
    "create_invoices",
    "edit_invoices",
    "view_invoices",
    "delete_invoices",
    "system_settings",
    "delete_records",
    "manage_work_details",
    "manage_work_progress",
    "verify_work",
    "assign_tasks",
    "approve_work",
    "upload_evidence",
  ],
  PPIC: [
    // Full access except invoice management (can view invoices read-only)
    "manage_vessels",
    "manage_work_orders",
    "create_work_orders",
    "edit_work_orders",
    "delete_work_orders",
    "view_all_reports",
    "export_data",
    "view_invoices", // Read-only access to invoices
    "manage_work_details",
    "manage_work_progress",
    "verify_work",
    "assign_tasks",
    "approve_work",
    "upload_evidence",
    "create_progress_reports",
  ],
  PRODUCTION: [
    // Full access except invoice management (can view invoices read-only)
    "manage_vessels",
    "manage_work_orders",
    "create_work_orders",
    "edit_work_orders",
    "delete_work_orders",
    "view_all_reports",
    "export_data",
    "view_invoices", // Read-only access to invoices
    "manage_work_details",
    "manage_work_progress",
    "verify_work",
    "assign_tasks",
    "approve_work",
    "upload_evidence",
    "create_progress_reports",
  ],
  OPERATION: [
    // Full access except invoice management (can view invoices read-only)
    "manage_vessels",
    "manage_work_orders",
    "create_work_orders",
    "edit_work_orders",
    "delete_work_orders",
    "view_all_reports",
    "export_data",
    "view_invoices", // Read-only access to invoices
    "manage_work_details",
    "manage_work_progress",
    "verify_work",
    "assign_tasks",
    "approve_work",
    "upload_evidence",
    "create_progress_reports",
  ],
  ADMIN: [
    // Full access except invoice management (can view invoices read-only)
    "manage_users", // Additional user management for admin
    "manage_vessels",
    "manage_work_orders",
    "create_work_orders",
    "edit_work_orders",
    "delete_work_orders",
    "view_all_reports",
    "export_data",
    "view_invoices", // Read-only access to invoices
    "system_settings", // Additional system settings for admin
    "manage_work_details",
    "manage_work_progress",
    "verify_work",
    "assign_tasks",
    "approve_work",
    "upload_evidence",
    "create_progress_reports",
  ],
  FINANCE: [
    // Full invoice access + read-only access to other sections
    "view_all_reports", // Read-only reports
    "view_vessels", // Read-only vessels
    "view_work_orders", // Read-only work orders
    "view_work_details", // Read-only work details
    "view_work_progress", // Read-only work progress
    "manage_invoices", // Full invoice management
    "create_invoices",
    "edit_invoices",
    "view_invoices",
    "delete_invoices",
    "export_invoice_data", // Can export invoice-related data
  ],
};

// Role hierarchy helper
const ROLE_HIERARCHY = {
  MASTER: 6,
  ADMIN: 5,
  PPIC: 4,
  PRODUCTION: 4,
  OPERATION: 4,
  FINANCE: 3,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile from profiles table
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      console.log("🔍 Fetching user profile for:", userId);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", userId)
        .single();

      if (error) {
        console.error("❌ Error fetching profile:", error);
        return null;
      }

      console.log("✅ Profile fetched:", data);
      return data;
    } catch (err) {
      console.error("💥 Error in fetchProfile:", err);
      return null;
    }
  };

  // Create profile if doesn't exist
  const createProfile = async (user: User): Promise<UserProfile | null> => {
    try {
      console.log("🆕 Creating new profile for user:", user.id);

      const profileData = {
        auth_user_id: user.id,
        email: user.email || "",
        full_name:
          user.user_metadata?.full_name || user.email?.split("@")[0] || "",
        name: user.user_metadata?.name || user.email?.split("@")[0] || "",
        role: "OPERATION" as const, // Default role for new users
        status: "active" as const,
      };

      const { data, error } = await supabase
        .from("profiles")
        .insert([profileData])
        .select()
        .single();

      if (error) {
        console.error("❌ Error creating profile:", error);
        return null;
      }

      console.log("✅ Profile created:", data);
      return data;
    } catch (err) {
      console.error("💥 Error in createProfile:", err);
      return null;
    }
  };

  // Sign in function
  const signIn = async (email: string, password: string) => {
    try {
      console.log("🔐 Starting sign in process...");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("❌ Sign in error:", error);
        return { user: null, profile: null, error };
      }

      console.log("✅ Authentication successful");

      // Fetch or create user profile
      let userProfile = await fetchProfile(data.user.id);

      if (!userProfile) {
        console.log("🆕 Profile not found, creating new one...");
        userProfile = await createProfile(data.user);
      }

      console.log("👤 Final user profile:", userProfile);
      console.log("🎯 User role:", userProfile?.role);
      console.log(
        "📊 Role hierarchy level:",
        ROLE_HIERARCHY[userProfile?.role || "OPERATION"]
      );
      console.log(
        "🔑 User permissions:",
        ROLE_PERMISSIONS[userProfile?.role || "OPERATION"]
      );

      return { user: data.user, profile: userProfile, error: null };
    } catch (err) {
      console.error("💥 Sign in process error:", err);
      return { user: null, profile: null, error: err };
    }
  };

  // Sign out function
  const signOut = async () => {
    console.log("🚪 Signing out...");
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    console.log("✅ Signed out successfully");
  };

  // Check if user has specific role(s)
  const hasRole = (roles: string | string[]): boolean => {
    if (!profile) return false;

    const rolesArray = Array.isArray(roles) ? roles : [roles];
    const result = rolesArray.includes(profile.role);

    console.log(
      `🔍 Role check: ${profile.role} in [${rolesArray.join(", ")}] = ${result}`
    );
    return result;
  };

  // Check if user has specific permission
  const hasPermission = (permission: string): boolean => {
    if (!profile) return false;

    const userPermissions = ROLE_PERMISSIONS[profile.role] || [];
    const result = userPermissions.includes(permission);

    console.log(
      `🔑 Permission check: ${permission} for role ${profile.role} = ${result}`
    );
    return result;
  };

  // Enhanced role checkers based on your requirements
  const isMaster = hasRole("MASTER");
  const isFullAccess = hasRole([
    "MASTER",
    "PPIC",
    "PRODUCTION",
    "OPERATION",
    "ADMIN",
  ]);
  const isFinance = hasRole("FINANCE");

  // Specific access checkers
  const canAccessInvoices =
    hasRole(["MASTER", "FINANCE"]) || hasPermission("view_invoices");
  const canEditInvoices =
    hasRole(["MASTER", "FINANCE"]) && hasPermission("edit_invoices");
  const canCreateWorkOrders = hasPermission("create_work_orders");
  const canEditWorkOrders = hasPermission("edit_work_orders");
  const canViewReports =
    hasPermission("view_all_reports") || hasPermission("view_own_reports");
  const canExportData =
    hasPermission("export_data") || hasPermission("export_invoice_data");

  // Refresh profile data
  const refreshProfile = async () => {
    if (user) {
      const updatedProfile = await fetchProfile(user.id);
      setProfile(updatedProfile);
    }
  };

  // Initialize auth state
  useEffect(() => {
    console.log("🚀 Initializing auth state...");

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("📱 Initial session:", session ? "Found" : "Not found");
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile);
      }

      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth state changed:", event);
      console.log("📱 New session:", session ? "Found" : "Not found");

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

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signOut,
    hasRole,
    hasPermission,
    isMaster,
    isFullAccess,
    isFinance,
    canAccessInvoices,
    canEditInvoices,
    canCreateWorkOrders,
    canEditWorkOrders,
    canViewReports,
    canExportData,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
