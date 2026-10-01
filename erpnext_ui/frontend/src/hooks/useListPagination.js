import { useCallback, useMemo, useState } from "react";

/**
 * Server-side list pagination state.
 * Keeps limit_start / limit_page_length math and page resets in one place.
 */
export default function useListPagination({ pageSize: initialPageSize = 10 } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState(0);

  const totalPages = useMemo(() => {
    if (totalItems <= 0) return 1;
    return Math.max(1, Math.ceil(totalItems / pageSize));
  }, [totalItems, pageSize]);

  const setTotal = useCallback((count) => {
    setTotalItems(Number(count) || 0);
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (next) => {
      const n = Math.min(Math.max(1, next), totalPages);
      setPage(n);
    },
    [totalPages],
  );

  const changePageSize = useCallback((nextSize) => {
    const n = Number(nextSize) || 10;
    setPageSizeState(n);
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    pageSize,
    setPageSize: changePageSize,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    goToPage,
    limit_start: (page - 1) * pageSize,
    limit_page_length: pageSize,
  };
}
