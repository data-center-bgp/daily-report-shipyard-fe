export const PAGE_SIZE = 10;

// Shared by every Master Data tab (Vessels, Locations, Work Scopes) — all
// paginate the same client-side-filtered list the same way.
export default function Pagination({
  page,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-gray-600">
        Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
        {Math.min(page * PAGE_SIZE, totalItems)} of {totalItems}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
        >
          ← Previous
        </button>

        <div className="flex gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-3 py-2 text-sm rounded-lg ${
                  pageNum === page
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 hover:bg-gray-50"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
