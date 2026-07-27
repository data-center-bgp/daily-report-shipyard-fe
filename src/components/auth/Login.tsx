import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

function ShipyardIllustration() {
  return (
    <svg
      viewBox="0 0 500 220"
      className="w-full h-full"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <linearGradient id="sky-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hull-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="wave-1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>

      <circle cx="390" cy="40" r="70" fill="url(#sky-glow)" />

      {/* Crane */}
      <g>
        <rect x="118" y="40" width="6" height="95" fill="#fbbf24" rx="1" />
        <rect x="70" y="40" width="120" height="6" fill="#fbbf24" rx="1" />
        <rect x="60" y="34" width="20" height="14" fill="#f59e0b" rx="2" />
        <line
          x1="180"
          y1="46"
          x2="180"
          y2="80"
          stroke="#94a3b8"
          strokeWidth="2"
        />
        <rect x="173" y="80" width="14" height="10" fill="#f59e0b" rx="1" />
      </g>

      {/* Ship hull */}
      <path
        d="M60 140 L440 140 L410 175 Q250 190 90 175 Z"
        fill="url(#hull-gradient)"
      />
      <rect x="60" y="128" width="380" height="14" fill="#334155" rx="2" />

      {/* Deckhouse */}
      <rect x="330" y="95" width="55" height="35" fill="#f8fafc" rx="3" />
      <rect x="338" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="354" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="370" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="392" y="88" width="10" height="42" fill="#f8fafc" rx="2" />

      {/* Containers on deck — the color pop */}
      <rect x="130" y="105" width="40" height="25" fill="#ef4444" rx="2" />
      <rect x="172" y="105" width="40" height="25" fill="#f97316" rx="2" />
      <rect x="214" y="105" width="40" height="25" fill="#0ea5e9" rx="2" />
      <rect x="130" y="80" width="40" height="25" fill="#facc15" rx="2" />
      <rect x="172" y="80" width="40" height="25" fill="#22c55e" rx="2" />

      {/* Waves */}
      <path
        d="M0 165 C 60 150, 120 150, 180 165 C 240 180, 300 180, 360 165 C 420 150, 460 150, 500 165 L500 220 L0 220 Z"
        fill="url(#wave-1)"
        opacity="0.9"
      />
      <path
        d="M0 185 C 70 172, 130 172, 200 185 C 270 198, 330 198, 400 185 C 440 176, 470 176, 500 185 L500 220 L0 220 Z"
        fill="#1e40af"
        opacity="0.7"
      />
      <path
        d="M0 202 C 80 194, 160 194, 240 202 C 320 210, 380 210, 500 202 L500 220 L0 220 Z"
        fill="#1e3a8a"
      />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn, user } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left — brand / illustration panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/25 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-16 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[size:28px_28px]" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <img
              src="/bgp-icon.jpg"
              alt="Barokah Galangan Perkasa"
              className="w-12 h-12 rounded-xl object-cover shadow-lg ring-1 ring-white/20"
            />
            <div>
              <p className="text-white font-bold leading-tight">
                Barokah Galangan Perkasa
              </p>
              <p className="text-blue-300 text-sm">
                Daily Report Shipyard System
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Keeping every vessel
              <br />
              on schedule.
            </h1>
            <p className="text-blue-200/80 text-lg">
              Track work orders, verify progress, and manage handovers — all
              in one place.
            </p>
          </div>

          <div className="h-48 -mx-12 -mb-12">
            <ShipyardIllustration />
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center text-center mb-8">
            <img
              src="/bgp-icon.jpg"
              alt="Barokah Galangan Perkasa"
              className="w-16 h-16 rounded-2xl object-cover shadow-lg mb-3"
            />
            <h1 className="text-2xl font-bold text-slate-900">
              Daily Report Shipyard
            </h1>
            <p className="text-slate-500 text-sm">Barokah Galangan Perkasa</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-2xl font-bold text-slate-900">
              Welcome back
            </h2>
            <p className="text-slate-500 mt-1">
              Sign in to continue to your dashboard.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-white font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-600/20 transform hover:scale-[1.01] active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-slate-500 text-sm">
            Need access?{" "}
            <span className="text-blue-600 font-medium">
              Contact your administrator
            </span>
          </p>

          <p className="mt-10 text-center text-slate-400 text-xs">
            © 2026 Daily Report Shipyard. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
