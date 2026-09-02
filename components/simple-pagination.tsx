"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface Props {
  totalPages: number;
  /**
   * Merged into every page link, including previous/next. Opt-in: this
   * component is shared with the dashboard's tables, which keep the default
   * shadcn pagination.
   */
  linkClassName?: string;
  /** Merged into the current page's link, after `linkClassName`. */
  activeLinkClassName?: string;
}

export function SimplePagination({
  totalPages,
  linkClassName,
  activeLinkClassName,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get("page")) || 1;

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  const renderPaginationItems = () => {
    const paginationItems = [];
    
    // Always show the first page and apply disabled logic
    paginationItems.push(
      <PaginationItem key={1}>
        <PaginationLink
          href={createPageURL(1)}
          isActive={currentPage === 1}
          aria-disabled={currentPage === 1}
          tabIndex={currentPage === 1 ? -1 : undefined}
          className={cn(
            linkClassName,
            currentPage === 1 && activeLinkClassName,
            currentPage === 1 && "pointer-events-none"
          )}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    // Show ellipsis if the current page is far from the start
    if (currentPage > 3) {
      paginationItems.push(<PaginationEllipsis key="start-ellipsis" />);
    }

    // Show pages around the current page (but not the first or last)
    for (
      let page = Math.max(2, currentPage - 1);
      page <= Math.min(totalPages - 1, currentPage + 1);
      page++
    ) {
      paginationItems.push(
        <PaginationItem key={page}>
          <PaginationLink
            href={createPageURL(page)}
            isActive={currentPage === page}
            aria-disabled={currentPage === page}
            tabIndex={currentPage === page ? -1 : undefined}
            className={cn(
              linkClassName,
              currentPage === page && activeLinkClassName,
              currentPage === page && "pointer-events-none"
            )}
          >
            {page}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Show ellipsis if the current page is far from the end
    if (currentPage < totalPages - 2) {
      paginationItems.push(<PaginationEllipsis key="end-ellipsis" />);
    }

    // Always show the last page (if it's not page 1) and apply disabled logic
    if (totalPages > 1) {
      paginationItems.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            href={createPageURL(totalPages)}
            isActive={currentPage === totalPages}
            aria-disabled={currentPage === totalPages}
            tabIndex={currentPage === totalPages ? -1 : undefined}
            className={cn(
              linkClassName,
              currentPage === totalPages && activeLinkClassName,
              currentPage === totalPages && "pointer-events-none"
            )}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return paginationItems;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={createPageURL(currentPage - 1)}
            aria-disabled={currentPage <= 1}
            tabIndex={currentPage <= 1 ? -1 : undefined}
            className={cn(
              linkClassName,
              currentPage <= 1 && "pointer-events-none opacity-50"
            )}
          />
        </PaginationItem>
        {renderPaginationItems()}
        <PaginationItem>
          <PaginationNext
            href={createPageURL(currentPage + 1)}
            aria-disabled={currentPage >= totalPages}
            tabIndex={currentPage >= totalPages ? -1 : undefined}
            className={cn(
              linkClassName,
              currentPage >= totalPages && "pointer-events-none opacity-50"
            )}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}