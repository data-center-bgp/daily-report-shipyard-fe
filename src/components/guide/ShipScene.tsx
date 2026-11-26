// The ship at the dock with its crane, the picture on the sign-in page, redrawn
// here for the presentation so the slides carry the same identity as the app.
// Kept as its own file so the presenter does not load the sign-in page code.

// Three bands of water, used as the foot of the dark slides.
export function Waves({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 60" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d="M0 20 C 60 5, 120 5, 180 20 C 240 35, 300 35, 360 20 C 420 5, 460 5, 500 20 L500 60 L0 60 Z"
        fill="#1d4ed8"
        opacity="0.55"
      />
      <path
        d="M0 34 C 70 21, 130 21, 200 34 C 270 47, 330 47, 400 34 C 440 26, 470 26, 500 34 L500 60 L0 60 Z"
        fill="#1e40af"
        opacity="0.7"
      />
      <path
        d="M0 48 C 80 41, 160 41, 240 48 C 320 55, 380 55, 500 48 L500 60 L0 60 Z"
        fill="#1e3a8a"
      />
    </svg>
  );
}

export default function ShipScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 200"
      className={className}
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="deck-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Crane */}
      <rect x="118" y="40" width="6" height="95" fill="#fbbf24" rx="1" />
      <rect x="70" y="40" width="120" height="6" fill="#fbbf24" rx="1" />
      <rect x="60" y="34" width="20" height="14" fill="#f59e0b" rx="2" />
      <line x1="180" y1="46" x2="180" y2="80" stroke="#94a3b8" strokeWidth="2" />
      <rect x="173" y="80" width="14" height="10" fill="#f59e0b" rx="1" />

      {/* Hull and deckhouse */}
      <path d="M60 140 L440 140 L410 175 Q250 190 90 175 Z" fill="url(#deck-hull)" />
      <rect x="60" y="128" width="380" height="14" fill="#334155" rx="2" />
      <rect x="330" y="95" width="55" height="35" fill="#f8fafc" rx="3" />
      <rect x="338" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="354" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="370" y="103" width="10" height="10" fill="#38bdf8" rx="1" />
      <rect x="392" y="88" width="10" height="42" fill="#f8fafc" rx="2" />

      {/* Containers */}
      <rect x="130" y="105" width="40" height="25" fill="#ef4444" rx="2" />
      <rect x="172" y="105" width="40" height="25" fill="#f97316" rx="2" />
      <rect x="214" y="105" width="40" height="25" fill="#0ea5e9" rx="2" />
      <rect x="130" y="80" width="40" height="25" fill="#facc15" rx="2" />
      <rect x="172" y="80" width="40" height="25" fill="#22c55e" rx="2" />
    </svg>
  );
}
