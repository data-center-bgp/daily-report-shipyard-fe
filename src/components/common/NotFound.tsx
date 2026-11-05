import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, SearchX } from "lucide-react";

// Shown for an address that matches no page (a mistyped or outdated link).
// It used to redirect silently to the Dashboard, which hid broken links.
export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  // No earlier page in this tab (the bad link was opened directly), so a
  // "Go back" button would leave the app.
  const canGoBack = location.key !== "default";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-lg rounded-lg bg-white p-6 sm:p-8 text-center shadow">
        <SearchX className="mx-auto mb-4 h-12 w-12 text-gray-400" />
        <h1 className="text-xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-gray-600">
          There is no page at this address. The link may be mistyped or out of
          date.
        </p>
        <p className="mt-3 break-all rounded bg-gray-50 px-3 py-2 font-mono text-sm text-gray-700">
          {location.pathname}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          {canGoBack && (
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" /> Go back
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
