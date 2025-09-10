import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";

interface LoginProps {
  onLogin?: (email: string, password: string) => void;
  onSwitchToRegister?: () => void;
}

export default function Login({ onLogin, onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the RBAC auth system
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Log login attempt
    console.log("🔐 Login attempt started");
    console.log("📧 Email:", email);
    console.log("🔒 Password length:", password.length);
    console.log("⏰ Timestamp:", new Date().toISOString());

    try {
      console.log("📡 Calling RBAC sign in...");

      // Use the RBAC signIn instead of direct Supabase auth
      const {
        user,
        profile,
        error: signInError,
      } = await signIn(email, password);

      if (signInError) {
        console.log("🚨 Login failed with error:", signInError.message);
        throw signInError;
      }

      console.log("✅ Login successful!");

      // Enhanced logging with Supabase user info
      console.log("👤 Supabase User Info:", {
        id: user?.id,
        email: user?.email,
        created_at: user?.created_at,
        updated_at: user?.updated_at,
        email_confirmed_at: user?.email_confirmed_at,
        phone: user?.phone,
        user_metadata: user?.user_metadata,
        app_metadata: user?.app_metadata,
      });

      // Detailed profile information from profiles table
      console.log("📋 User Profile from Database:", {
        profile_id: profile?.id,
        auth_user_id: profile?.auth_user_id,
        email: profile?.email,
        full_name: profile?.full_name,
        name: profile?.name,
        role: profile?.role,
        department: profile?.department,
        phone: profile?.phone,
        status: profile?.status,
        created_at: profile?.created_at,
        updated_at: profile?.updated_at,
      });

      // Role-based access information
      console.log("🎯 RBAC Information:", {
        role: profile?.role,
        is_master: profile?.role === "MASTER",
        is_full_access: [
          "MASTER",
          "PPIC",
          "PRODUCTION",
          "OPERATION",
          "ADMIN",
        ].includes(profile?.role || ""),
        is_finance: profile?.role === "FINANCE",
        can_access_invoices: ["MASTER", "FINANCE"].includes(
          profile?.role || ""
        ),
        can_edit_invoices: ["MASTER", "FINANCE"].includes(profile?.role || ""),
      });

      // Log specific permissions based on role
      const rolePermissions = {
        MASTER: "🔑 MASTER: Complete unrestricted access to everything",
        PPIC: "🏭 PPIC: Full access except invoice editing (can view invoices)",
        PRODUCTION:
          "⚙️ PRODUCTION: Full access except invoice editing (can view invoices)",
        OPERATION:
          "🔧 OPERATION: Full access except invoice editing (can view invoices)",
        ADMIN:
          "👑 ADMIN: Full access except invoice editing (can view invoices)",
        FINANCE:
          "💰 FINANCE: Full invoice access + read-only for other modules",
      };

      console.log(
        "🔐 Role Description:",
        rolePermissions[profile?.role || "OPERATION"]
      );

      // Log what they can and cannot do
      if (profile?.role === "MASTER") {
        console.log(
          "✅ MASTER Permissions: Can do EVERYTHING - No restrictions"
        );
      } else if (
        ["PPIC", "PRODUCTION", "OPERATION", "ADMIN"].includes(
          profile?.role || ""
        )
      ) {
        console.log("✅ Full Access Permissions:");
        console.log("  - ✅ Create/Edit/Delete Work Orders");
        console.log("  - ✅ Manage Vessels");
        console.log("  - ✅ View All Reports");
        console.log("  - ✅ Export Data");
        console.log("  - ✅ Manage Work Details & Progress");
        console.log("  - 👁️ View Invoices (Read-only)");
        console.log("  - ❌ Cannot Edit/Create/Delete Invoices");
      } else if (profile?.role === "FINANCE") {
        console.log("💰 Finance Permissions:");
        console.log("  - ✅ Full Invoice Management (Create/Edit/Delete)");
        console.log("  - ✅ Export Invoice Data");
        console.log("  - 👁️ View Work Orders (Read-only)");
        console.log("  - 👁️ View Vessels (Read-only)");
        console.log("  - 👁️ View Reports (Read-only)");
        console.log("  - 👁️ View Work Details & Progress (Read-only)");
        console.log("  - ❌ Cannot Create/Edit Work Orders");
        console.log("  - ❌ Cannot Edit Vessels");
      }

      // Profile validation checks
      console.log("🔍 Profile Validation:");
      console.log("  - Profile exists:", !!profile);
      console.log(
        "  - Profile ID matches user:",
        profile?.auth_user_id === user?.id
      );
      console.log("  - Email matches:", profile?.email === user?.email);
      console.log("  - Profile status:", profile?.status || "unknown");

      // Call the onLogin callback if provided
      if (onLogin) {
        console.log("📞 Calling onLogin callback...");
        onLogin(email, password);
      } else {
        console.log("⚠️ No onLogin callback provided");
      }
    } catch (err) {
      console.log("💥 Login error caught:", err);
      console.log("🔍 Error details:", {
        message: err instanceof Error ? err.message : "Unknown error",
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
      });

      setError(
        err instanceof Error ? err.message : "An error occurred during login"
      );
    } finally {
      setIsLoading(false);
      console.log("🏁 Login process completed");
      console.log("=".repeat(50));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-slate-300">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-white mb-2"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                placeholder="Enter your email"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                placeholder="Enter your password"
              />
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-blue-400 focus:ring-blue-400 border-white/20 rounded bg-white/10"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 block text-sm text-slate-300"
                >
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a
                  href="#"
                  className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
                >
                  Forgot your password?
                </a>
              </div>
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  "Sign in"
                )}
              </button>
            </div>
          </form>

          {/* Sign up link */}
          <div className="mt-6 text-center">
            <p className="text-slate-300">
              Don't have an account?{" "}
              <button
                onClick={onSwitchToRegister}
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200 bg-transparent border-none cursor-pointer"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-slate-400 text-sm">
            © 2025 Daily Report Shipyard. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
