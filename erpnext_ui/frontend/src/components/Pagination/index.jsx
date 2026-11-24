import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";

function PageNumber({ currentPage, totalPages, onPageChange, disabled }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(currentPage));
  const commit = () => {
    const page = Number(value);
    if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
      if (page !== currentPage) onPageChange(page);
      setValue(String(page));
    } else {
      setValue(String(currentPage));
    }
  };
  return <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
    <input type="number" min="1" max={totalPages} step="1" inputMode="numeric" value={value} disabled={disabled}
      aria-label={t("common.pageOf", { page: currentPage, total: totalPages })}
      onChange={(event) => setValue(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") setValue(String(currentPage)); }}
      className="h-7 w-12 rounded border border-border bg-background px-1 text-center text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <span aria-hidden="true">/ {totalPages}</span>
  </span>;
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
  showRange = false,
}) {
  const { t } = useTranslation();
  if ((!totalPages || totalPages <= 1) && !onPageSizeChange && !showRange) return null;
  const range = totalItems != null && totalItems !== "" && pageSize
    ? t("common.showingRange", { from: totalItems ? (currentPage - 1) * pageSize + 1 : 0, to: Math.min(currentPage * pageSize, totalItems), total: totalItems })
    : t("common.pageOf", { page: currentPage, total: totalPages });
  const buttonClass = "flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";
  return <nav aria-label={t("common.pagination")} className={cn("flex flex-wrap items-center gap-2", className)}>
    {showRange && <span className="text-xs tabular-nums text-muted-foreground">{range}</span>}
    {onPageSizeChange && <label className="flex items-center gap-1 text-xs text-muted-foreground"><span className="sr-only sm:not-sr-only">{t("common.rowsPerPage")}</span><select className="h-7 rounded border border-input bg-background px-1 text-xs text-foreground" value={pageSize ?? pageSizeOptions[0]} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={disabled}>{pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
    {totalPages > 1 && <div className="flex items-center gap-1">
      <button type="button" className={buttonClass} disabled={disabled || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label={t("common.previous")}><ChevronLeft className="size-4 rtl:rotate-180" /></button>
      <PageNumber key={`${currentPage}-${totalPages}`} currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} disabled={disabled} />
      <button type="button" className={buttonClass} disabled={disabled || currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} aria-label={t("common.next")}><ChevronRight className="size-4 rtl:rotate-180" /></button>
    </div>}
  </nav>;
}
