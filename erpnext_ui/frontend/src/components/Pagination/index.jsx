import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";

/** Windowed page numbers: 1 … 4 5 6 … 13 (max ~7 numbers). Always objects. */
function getPageItems(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => ({
      type: "page",
      page: i + 1,
      key: i + 1,
    }));
  }

  const pages = new Set([1, totalPages]);
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let p = start; p <= end; p += 1) pages.add(p);

  // If sleeve touches edges, expand slightly so ellipsis looks balanced
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) items.push({ type: "gap", key: `gap-${prev}` });
    items.push({ type: "page", page: p, key: p });
    prev = p;
  }
  return items;
}

function navBtnClass(disabled) {
  return cn(
    "flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
    disabled && "pointer-events-none opacity-40",
  );
}

function pageBtnClass(active) {
  return cn(
    "h-7 min-w-7 cursor-pointer rounded-lg px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  disabled = false,
  className,
}) {
  const { t } = useTranslation();

  if (!totalPages || totalPages <= 1) {
    // Still show range + page size when there is a real dataset of 1 page
    const singlePageWithMeta =
      totalPages === 1 && (totalItems != null || onPageSizeChange);
    if (!singlePageWithMeta) return null;
  }

  const items = getPageItems(currentPage, totalPages);
  const canPrev = currentPage > 1 && !disabled;
  const canNext = currentPage < totalPages && !disabled;

  const range =
    totalItems != null && totalItems !== "" && pageSize
      ? (() => {
          const from = (currentPage - 1) * pageSize + 1;
          const to = Math.min(currentPage * pageSize, totalItems);
          return t("common.showingRange", { from, to, total: totalItems });
        })()
      : null;

  return (
    <nav
      role="navigation"
      aria-label={t("common.pagination")}
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-2",
        className,
      )}
    >
      {/* RANGE / total — left in card footer */}
      <div className="order-2 w-full text-center text-xs text-muted-foreground tabular-nums sm:order-1 sm:w-auto sm:text-start">
        {range || t("common.pageOf", { page: currentPage, total: totalPages })}
      </div>

      {/* CONTROLS + PAGE SIZE — right in card footer */}
      <div className="order-1 flex w-full flex-wrap items-center justify-center gap-2 sm:order-2 sm:w-auto sm:justify-end">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">
              {t("common.rowsPerPage")}
            </span>
            <select
              className="h-7 rounded-lg border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={pageSize ?? pageSizeOptions[0]}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={disabled}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={navBtnClass(!canPrev)}
            disabled={!canPrev}
            onClick={() => onPageChange(currentPage - 1)}
            aria-label={t("common.previous")}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>

          <div className="flex items-center gap-1">
            {items.map((item) =>
              item.type === "gap" ? (
                <span
                  key={item.key}
                  className="flex size-7 items-center justify-center text-muted-foreground"
                  aria-hidden
                >
                  <MoreHorizontal className="size-3.5" />
                  <span className="sr-only">{t("common.morePages")}</span>
                </span>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  className={pageBtnClass(item.page === currentPage)}
                  aria-current={item.page === currentPage ? "page" : undefined}
                  aria-label={t("common.pageOf", {
                    page: item.page,
                    total: totalPages,
                  })}
                  disabled={disabled}
                  onClick={() => onPageChange(item.page)}
                >
                  {item.page}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            className={navBtnClass(!canNext)}
            disabled={!canNext}
            onClick={() => onPageChange(currentPage + 1)}
            aria-label={t("common.next")}
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </nav>
  );
}
