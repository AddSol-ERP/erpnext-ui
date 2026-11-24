import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlus, Plus } from "lucide-react";
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
import { ListFloatingActionsContext } from "./List/floatingActions";

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
  footerAlways = false,
  floatingAction,
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
  const { setShellMode, header } = useHeader();
  const [floatingTarget, setFloatingTarget] = useState(null);
  const primaryActions = (header?.actions || []).filter((action) => action?.variant === "btn-primary");
  const primaryAction = primaryActions.length === 1 ? primaryActions[0] : null;
  const ActionIcon = primaryAction?.icon && typeof primaryAction.icon !== "string" ? primaryAction.icon : Plus;
  const effectiveFloatingAction = floatingAction || (primaryAction && <Button type="button" size="icon-sm" className="size-9" disabled={primaryAction.disabled} onClick={primaryAction.onClick} aria-label={primaryAction.label} title={primaryAction.label}>{typeof primaryAction.icon === "string" ? <i className={primaryAction.icon} /> : <ActionIcon />}</Button>);

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
    (footer || pagination) && (footerAlways || (!loading && !error && !showEmpty));

  return (
    <ListFloatingActionsContext.Provider value={floatingTarget}>
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-[1600px] flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200",
        className,
      )}
    >
      {/* Single card: toolbar + content + footer */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-card">
        {tabs && <nav className="shrink-0 overflow-x-auto border-b border-border/60 [&>div]:!flex-nowrap [&>div]:!gap-0 [&>div]:!pb-0 [&_button]:!min-h-9 [&_button]:!shrink-0 [&_button]:!rounded-none [&_button]:!border-b-2 [&_button]:!border-transparent [&_button]:!bg-transparent [&_button]:!px-3 [&_button]:!py-0 [&_button]:!text-xs [&_button]:!shadow-none [&_button]:!ring-0 [&_button:focus-visible]:!ring-2 [&_button:focus-visible]:!ring-ring [&_button[aria-pressed=true]]:!border-primary [&_button[aria-pressed=true]]:!text-primary [&_button[aria-current=page]]:!border-primary [&_button[aria-current=page]]:!text-primary">{tabs}</nav>}
        <div className="flex min-h-0 flex-1 flex-col">
        {/* Body — single scroll container (tables stick here, no nested scrollers) */}
        <div className="list-body relative flex min-h-0 flex-1">
        <div className="list-scroll min-w-0 flex-1 overflow-auto overscroll-contain [&_table_th]:h-8 [&_table_th]:px-2.5 [&_table_td]:px-2.5 [&_table_td]:py-1">
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
        <div ref={setFloatingTarget} className="list-action-rail absolute bottom-3 end-3 z-20 flex flex-col items-center gap-2 empty:hidden print:hidden [&>button]:shadow-md">{effectiveFloatingAction}</div>
        </div>

        <div className="hidden min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/60 bg-card px-2 py-0.5 has-[>div:not(:empty)]:flex">
          {showFooter && <div className="min-w-0">{footer || pagination}</div>}
          {actionBar && <div className="min-w-0 flex-1 basis-full sm:basis-auto [&_[data-slot=list-action-row]]:!p-0">{actionBar}</div>}
        </div>
        </div>
      </div>
    </div>
    </ListFloatingActionsContext.Provider>
  );
}
