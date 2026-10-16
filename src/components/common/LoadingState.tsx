interface LoadingStateProps {
  /** What is loading, e.g. "Loading invoices..." */
  label?: string;
  /**
   * - "page" (default): fills the content area beside the sidebar — use for
   *   a page's own first load and the lazy-route fallback inside Layout.
   * - "inline": a shorter block for loaders embedded under a page header or
   *   inside a tab, so the surrounding page doesn't jump.
   * - "fullScreen": covers the whole viewport with the brand name — only for
   *   app boot and the signed-out routes, where there is no Layout yet.
   */
  variant?: "page" | "inline" | "fullScreen";
}

const CONTAINER_CLASS = {
  page: "flex items-center justify-center min-h-[60vh] px-6 py-12",
  inline: "flex items-center justify-center py-16 px-6",
  fullScreen:
    "min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50",
};

/**
 * The app's one loading indicator: the BGP mark inside a spinning gradient
 * ring. It fades in after a short delay (see .loader-fade-in in index.css) so
 * lazy routes and fast queries that resolve almost instantly don't flash it.
 */
export default function LoadingState({
  label = "Loading...",
  variant = "page",
}: LoadingStateProps) {
  const fullScreen = variant === "fullScreen";

  return (
    <div role="status" aria-live="polite" className={CONTAINER_CLASS[variant]}>
      <div className="loader-fade-in flex flex-col items-center gap-4">
        <div className={`relative ${fullScreen ? "h-20 w-20" : "h-14 w-14"}`}>
          <div className="loader-breathe absolute -inset-2 rounded-full bg-blue-400/20 blur-xl" />
          <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
          <div className="loader-arc absolute inset-0 rounded-full" />
          {/* An <img> keeps its intrinsic size under `inset` alone, so the
              wrapper does the positioning and the image just fills it. */}
          <div className="loader-breathe absolute inset-[15%]">
            <img
              src="/bgp-icon.jpg"
              alt=""
              className="h-full w-full rounded-full bg-white object-cover shadow-md shadow-blue-900/10 ring-1 ring-blue-100"
            />
          </div>
        </div>
        <div className="text-center">
          {fullScreen && (
            <p className="text-base font-semibold text-blue-950">
              Daily Report Shipyard
            </p>
          )}
          <p className="text-sm font-medium text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
