import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./StatusBadge";

/**
 * Lightweight desktop table for list pages.
 * Hosted by ListLayout (single scroll container) — no nested scroller here.
 * Sticky header sticks within the ListLayout body scroller.
 */
export default function DataTable({
  columns = [],
  data = [],
  rowKey = (row, i) => row?.name ?? i,
  onRowClick,
  loading = false,
  className,
  rowClassName,
  rowOffset = 0,
  showIndex = true,
}) {
  if (loading) {
    return (
      <div className={cn("relative w-full bg-transparent", className)}>
        <div className="border-b border-border/70 bg-table-header px-3 py-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border/60">
          {["w-1/3", "w-1/2", "w-2/5", "w-1/4", "w-3/5"].map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3.5">
              <Skeleton className="h-4 w-6 shrink-0" />
              <Skeleton className={cn("h-3.5", w)} />
              <Skeleton className="ms-auto h-3 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full bg-transparent", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-10 bg-table-header shadow-[0_1px_0_rgba(15,23,42,0.06)] [&_tr]:border-b [&_tr]:border-border/70">
          <tr>
            {showIndex && (
              <th
                scope="col"
                className="h-10 w-10 px-3 text-start align-middle text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase text-muted-foreground"
              >
                #
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn(
                  "h-10 px-3 text-start align-middle text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase text-muted-foreground",
                  col.hideBelow === "md" && "hidden md:table-cell",
                  col.hideBelow === "lg" && "hidden lg:table-cell",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((row, index) => {
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={rowKey(row, index)}
                className={cn(
                  "group border-b border-border/50 transition-colors last:border-b-0",
                  clickable &&
                    "cursor-pointer hover:bg-primary/[0.04] focus-visible:bg-primary/[0.04] focus-visible:outline-none",
                  rowClassName?.(row),
                )}
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? "button" : undefined}
                onClick={
                  clickable ? () => onRowClick(row, index) : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row, index);
                        }
                      }
                    : undefined
                }
              >
                {showIndex && (
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums text-muted-foreground">
                    {rowOffset + index + 1}
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      "px-3 py-2.5 align-middle text-sm",
                      col.cellClassName,
                      col.hideBelow === "md" && "hidden md:table-cell",
                      col.hideBelow === "lg" && "hidden lg:table-cell",
                      col.className,
                    )}
                  >
                    {col.cell ? col.cell(row, index) : row?.[col.id]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { StatusBadge };
