"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function Pagination({ totalPages }: { totalPages: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;
  const { replace } = useRouter();

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  const handlePageChange = (page: number) => {
    replace(createPageURL(page));
  };

  if (totalPages <= 1) return null;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 7;

    if (totalPages <= maxPagesToShow) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push("...");
      }

      // Show current page and surrounding pages
      const startPage = Math.max(2, currentPage - 1);
      const endPage = Math.min(totalPages - 1, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav aria-label="ניווט עמודים" className="flex flex-col items-center gap-4 mt-8 mb-6">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* First Page Button */}
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage <= 1}
          className="px-3 py-2 border border-border rounded-lg hover:bg-primary/10 hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background disabled:hover:border-border text-foreground font-medium transition-all duration-200"
          aria-label="עמוד ראשון"
        >
          ⏮ ראשון
        </button>

        {/* Previous Button */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-4 py-2 border border-border rounded-lg hover:bg-primary/10 hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background disabled:hover:border-border text-foreground font-medium transition-all duration-200"
          aria-label="עמוד קודם"
        >
          ← הקודם
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground" aria-hidden="true">
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                aria-current={isActive ? "page" : undefined}
                className={`min-w-[40px] px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "border border-border text-foreground hover:bg-primary/10 hover:border-primary/40"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-4 py-2 border border-border rounded-lg hover:bg-primary/10 hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background disabled:hover:border-border text-foreground font-medium transition-all duration-200"
          aria-label="עמוד הבא"
        >
          הבא →
        </button>

        {/* Last Page Button */}
        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="px-3 py-2 border border-border rounded-lg hover:bg-primary/10 hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background disabled:hover:border-border text-foreground font-medium transition-all duration-200"
          aria-label="עמוד אחרון"
        >
          אחרון ⏭
        </button>
      </div>

      {/* Page Info */}
      <div className="text-sm text-muted-foreground font-medium">
        עמוד {currentPage} מתוך {totalPages}
      </div>
    </nav>
  );
}
