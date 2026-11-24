import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 10;

// Shared by every client-side-filtered list that paginates the same way:
// Master Data (Vessels, Locations, Work Scopes) at the default PAGE_SIZE,
// and any denser table that passes its own pageSize. Buttons are 44px on
// touch screens, and the current page is exposed with aria-current.
export default function Pagination({
  page,
  totalItems,
  onPageChange,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const button =
    "inline-flex h-11 items-center justify-center rounded-md text-sm font-medium sm:h-10";

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-sm tabular-nums text-slate-600">
        Showing {(page - 1) * pageSize + 1} to{" "}
        {Math.min(page * pageSize, totalItems)} of {totalItems}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${button} w-11 border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:w-10`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              aria-label={`Page ${pageNum}`}
              aria-current={pageNum === page ? "page" : undefined}
              className={`${button} min-w-11 px-3 tabular-nums sm:min-w-10 ${
                pageNum === page
                  ? "bg-blue-950 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {pageNum}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Next page"
          className={`${button} w-11 border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:w-10`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
