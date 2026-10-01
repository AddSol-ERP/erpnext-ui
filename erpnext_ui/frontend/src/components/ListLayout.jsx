import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { useHeader } from "../context/HeaderContext";

/**
 * List shell: one elevated card wrapping toolbar → (optional tabs) → content → footer.
 *
 * contentMode:
 *  - "cards" → vertical list (mobile)
 *  - "table" → desktop table children
 *  - "auto"  → both trees with responsive visibility (pass cards + table)
 *
 * children: any React node (legacy) OR
 * { cards: node, table: node } when mode supports dual render.
 *
 * tabs: optional node rendered as a top strip inside the card (status segments).
 * footer: optional node under content (pagination); defaults to `pagination`.
 */
export default function ListLayout({
  actionBar,
  children,
  cards,
  table,
  contentMode = "children",
  pagination,
  footer,
  tabs,
  emptyState,
  emptyTitle,
  emptyDescription,
  emptyAction,
  isEmpty,
  loading = false,
  error,
  onRetry,
  className,
}) {
  const { t } = useTranslation();
  const { setShellMode } = useHeader();

  // Lists render setHeader actions inside ActionBar — hide bottom PageToolbar actions.
  useEffect(() => {
    setShellMode?.("list");
    return () => setShellMode?.("default");
  }, [setShellMode]);

  const showEmpty =
    !loading &&
    !error &&
    (isEmpty ||
      (isEmpty === undefined &&
        contentMode === "children" &&
        (children == null || (Array.isArray(children) && children.length === 0))));

  const showFooter =
    (footer || pagination) && !loading && !error && !showEmpty;

  return (
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-[1600px] flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200",
        className,
      )}
    >
      {/* Single card: toolbar + content + footer */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]">
        {/* Optional status tabs (top strip) */}
        {tabs ? (
          <div className="shrink-0 border-b border-border/60 px-3 pt-2 sm:px-4">
            {tabs}
          </div>
        ) : null}

        {/* Toolbar: search / filters / export — flush inside card */}
        {actionBar ? (
          <div className="shrink-0 border-b border-border/60">{actionBar}</div>
        ) : null}

        {/* Body — single scroll container (tables stick here, no nested scrollers) */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {loading ? (
            <div className="flex flex-col">
              {[
                ["w-1/3", "w-1/4"],
                ["w-1/2", "w-1/3"],
                ["w-2/5", "w-1/5"],
                ["w-1/4", "w-2/5"],
                ["w-3/5", "w-1/3"],
              ].map(([titleW, subW], i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5"
                >
                  <Skeleton className="size-8 shrink-0 rounded-none" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className={cn("h-3.5", titleW)} />
                    <Skeleton className={cn("h-3", subW)} />
                  </div>
                  <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm font-medium text-destructive">
                {error?.message || t("common.error")}
              </p>
              {onRetry ? (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  {t("common.retry")}
                </Button>
              ) : null}
            </div>
          ) : showEmpty ? (
            <Empty className="mx-auto my-6 w-full max-w-md rounded-none border border-dashed border-border bg-transparent p-8">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="size-12 rounded-none border border-primary/25 bg-primary/10 text-primary"
                >
                  <ListPlus className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{emptyTitle || t("common.noData")}</EmptyTitle>
                {emptyDescription ? (
                  <EmptyDescription>{emptyDescription}</EmptyDescription>
                ) : null}
              </EmptyHeader>
              {emptyAction ? <div>{emptyAction}</div> : null}
              {!emptyAction && typeof emptyState === "string" ? (
                <p className="text-xs text-muted-foreground">{emptyState}</p>
              ) : null}
              {!emptyAction && emptyState && typeof emptyState !== "string"
                ? emptyState
                : null}
            </Empty>
          ) : (
            <>
              {contentMode === "cards" ? (
                <div className="flex flex-col md:hidden">{cards}</div>
              ) : null}
              {contentMode === "cards" ? (
                <div className="hidden flex-col md:flex">{table}</div>
              ) : null}
              {contentMode === "table" ? table : null}
              {contentMode === "children" ? children : null}
              {contentMode === "auto" ? (
                <>
                  <div className="flex flex-col md:hidden">{cards}</div>
                  <div className="hidden md:flex md:flex-col">{table}</div>
                </>
              ) : null}
            </>
          )}
        </div>

        {/* Footer: results + pagination inside card */}
        {showFooter ? (
          <div className="shrink-0 border-t border-border/60 bg-card/80 px-3 py-2 sm:px-4">
            {footer || pagination}
          </div>
        ) : null}
      </div>
    </div>
  );
}
