import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Download, Filter, MoreHorizontal, Printer, RefreshCcw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "../../hooks/use-mobile";
import { useElementWidth } from "../../hooks/useElementWidth";
import { useHeader } from "../../context/HeaderContext";
import { cn } from "cn";
import { mapVariant } from "../../lib/mapVariant";
import ActiveFilterChips from "../List/ActiveFilterChips";
import FilterFields from "../FilterModal/FilterFields";
import { buildFilterChips } from "../../lib/filterChips";
import { useListFloatingActions } from "../List/floatingActions";

function ActionIcon({ icon }) {
  if (!icon) return null;
  if (typeof icon === "string") return <i className={icon} />;
  const Icon = icon;
  return <Icon className="size-4" />;
}

/** Page actions from setHeader (New / Refresh / …) as labeled buttons. */
function HeaderActions({ actions, hideRefreshOnDesktop = false, refreshLabel }) {
  const { t } = useTranslation();
  if (!actions?.length) return null;

  const secondaryActions = actions.filter((action) => action.label !== refreshLabel);
  const visibleActions = secondaryActions.length > 1 ? actions.filter((action) => action.label === refreshLabel) : actions;

  return (
    <>
      {visibleActions.map((action, i) => {
        const map = mapVariant(action.variant);
        return (
          <Button
            key={`${action.label ?? i}-${i}`}
            size="sm"
            variant={map.variant}
            className={cn(map.className, hideRefreshOnDesktop && action.label === refreshLabel && "xl:hidden")}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
          >
            <ActionIcon icon={action.icon} />
            <span className="truncate">{action.label}</span>
          </Button>
        );
      })}
      {secondaryActions.length > 1 && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm"><MoreHorizontal />{t("common.moreActions")}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">{secondaryActions.map((action, i) => <DropdownMenuItem key={`${action.label ?? i}-${i}`} disabled={action.disabled} onSelect={action.onClick}><ActionIcon icon={action.icon} />{action.label}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>}
    </>
  );
}

/**
 * Shared list toolbar: search, applied-filter chips, filter surface, print, export.
 * Also renders setHeader page actions (New/Refresh) on the same row as Filter
 * when the shell is in list mode (ListLayout sets shellMode).
 *
 * Search:
 *  - Uncontrolled: debounces then calls `onSearch`
 *  - Controlled: pass `value`; parent owns debounce; `onSearch` called on change
 *  - Width: full on mobile, ~50% on sm+
 *
 * Filter (owned mode — pass filterConfig + selectedFilters + handlers):
 *  - Desktop (md+): anchored Popover
 *  - Mobile: bottom Sheet
 *  - Batch apply via onApplyFilters
 *
 * Legacy: pass `onFilter` only to open an external surface.
 */
export default function ActionBar({
  onSearch,
  onFilter,
  onPrint,
  onExport,
  extra = null,
  leading = null,
  compact = false,
  searchClassName,
  resultCountClassName,
  headerActionsClassName,
  topBarSearch = true,
  value,
  defaultValue = "",
  debounce = 400,
  filterCount = 0,
  showFilterCount = true,
  filterConfig = null,
  selectedFilters = null,
  onApplyFilters,
  onRemoveFilter,
  onClearFilters,
  resultCount = null,
  // Opt-in: render the filters in the toolbar row when they fit, instead of
  // behind the dropdown. Off by default so existing lists are untouched.
  inlineFilters = false,
}) {
  const { t } = useTranslation();
  const { header, shellMode, listToolbarOwner, registerListToolbar } = useHeader();
  const toolbarId = useId();
  const floatingTarget = useListFloatingActions();
  const [headerTarget, setHeaderTarget] = useState(null);
  const isMobile = useIsMobile();
  const isControlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const searchValue = isControlled ? value : inner;
  const onSearchRef = useRef(onSearch);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const actions = shellMode === "list" ? header?.actions || [] : [];
  const primaryActions = actions.filter((action) => action?.variant === "btn-primary");
  const headerActions = primaryActions.length === 1 ? actions.filter((action) => action !== primaryActions[0]) : actions;
  const isHeaderOwner = topBarSearch && shellMode === "list" && listToolbarOwner === toolbarId && !!headerTarget;
  const refreshAction = headerActions.find((action) => action.label === t("common.refresh"));

  useEffect(() => {
    if (!topBarSearch || shellMode !== "list" || !registerListToolbar) return undefined;
    return registerListToolbar(toolbarId);
  }, [topBarSearch, shellMode, registerListToolbar, toolbarId]);
  useEffect(() => {
    if (!topBarSearch || shellMode !== "list") return undefined;
    const frame = requestAnimationFrame(() => setHeaderTarget(document.getElementById("list-header-search")));
    return () => cancelAnimationFrame(frame);
  }, [topBarSearch, shellMode]);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Debounced emit when uncontrolled
  useEffect(() => {
    if (isControlled) return undefined;
    const emit = onSearchRef.current;
    if (!emit) return undefined;
    if (debounce <= 0) {
      emit(searchValue);
      return undefined;
    }
    const timer = setTimeout(() => {
      emit(searchValue);
    }, debounce);
    return () => clearTimeout(timer);
  }, [searchValue, isControlled, debounce]);

  const emit = (next) => {
    if (!isControlled) setInner(next);
    if (isControlled && onSearch) onSearch(next);
  };

  const clearSearch = () => {
    emit("");
  };

  const filters = selectedFilters || {};
  const ownsFilter = Boolean(filterConfig && onApplyFilters);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const count = ownsFilter ? activeCount : filterCount;
  const hasConfig = Boolean(filterConfig?.filters?.length);
  const showFilterButton =
    Boolean(onFilter) || (ownsFilter && (hasConfig || activeCount > 0));

  // Placed here, after ownsFilter/showFilterButton, because showInline reads
  // ownsFilter -- declaring it earlier hits the temporal dead zone.
  const [rowRef, rowWidth] = useElementWidth();
  const filterFieldCount = (filterConfig?.filters || []).length;

  // Intrinsic width of an inline filter row: the search box, one slot per
  // filter, and the result-count pill. Deliberately an estimate rather than a
  // measured DOM -- measuring the fields themselves would mean rendering them
  // first, which is the thing being decided.
  const INLINE_SEARCH_PX = 220;
  const INLINE_RESULT_PX = 96;
  const INLINE_FILTER_PX = 168;
  const inlineNeeds =
    INLINE_SEARCH_PX +
    INLINE_RESULT_PX +
    filterFieldCount * INLINE_FILTER_PX +
    140; // the action cluster on the end side

  // width 0 = not measured yet, so default to the compact control rather than
  // rendering a row of filters that immediately wraps.
  const showInline =
    !floatingTarget &&
    inlineFilters &&
    ownsFilter &&
    filterFieldCount > 0 &&
    !isMobile &&
    rowWidth >= inlineNeeds;


  const chips = ownsFilter
    ? buildFilterChips({
        selectedFilters: filters,
        filterConfig,
        onRemoveFilter,
      })
    : [];

  const filterLabel =
    count > 0
      ? `${t("common.filters")} · ${count}`
      : t("common.filters");

  const openFilter = () => {
    if (ownsFilter) {
      setDraftFilters({ ...filters });
      setFilterOpen(true);
      return;
    }
    onFilter?.();
  };

  const applyFilters = () => {
    onApplyFilters?.(draftFilters);
    setFilterOpen(false);
  };

  const panelBody = (
    <>
      <FilterFields
        config={filterConfig}
        values={draftFilters}
        onValuesChange={setDraftFilters}
      />
    </>
  );

  const panelFooter = (
    <>
      <Button variant="outline" onClick={() => setDraftFilters({})}>
        {t("common.clear")}
      </Button>
      <Button onClick={applyFilters}>{t("common.apply")}</Button>
    </>
  );

  const filterControl = showFilterButton && ownsFilter && !showInline ? (
    isMobile ? (
      <Button variant="outline" size="sm" className={cn("relative gap-1.5", floatingTarget && "size-9 bg-card p-0")}
        aria-label={filterLabel} title={filterLabel} aria-expanded={filterOpen} onClick={openFilter}>
        <Filter />{count > 0 ? <span className={cn("flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground", floatingTarget && "absolute -end-1 -top-1")}>{count}</span> : <span className="sr-only">{t("common.filters")}</span>}
      </Button>
    ) : (
      <Popover open={filterOpen} onOpenChange={(open) => { if (open) setDraftFilters({ ...filters }); setFilterOpen(open); }}>
        <PopoverTrigger asChild><Button variant="outline" size="sm" className={cn("relative gap-1.5", floatingTarget && "size-9 bg-card p-0")} aria-label={filterLabel} title={filterLabel} aria-expanded={filterOpen}><Filter /><span className={cn("hidden sm:inline", floatingTarget && "sm:sr-only")}>{filterLabel}</span>{floatingTarget && count > 0 && <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{count}</span>}</Button></PopoverTrigger>
        <PopoverContent align="end" side={floatingTarget ? "top" : "bottom"} sideOffset={6} className="w-80 rounded-none bg-card p-0">
          <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">{t("common.filters")}</div>
          <div className="max-h-[min(60vh,420px)] overflow-y-auto p-3">{panelBody}</div>
          <div className="flex justify-end gap-2 border-t border-border/60 p-2">{panelFooter}</div>
        </PopoverContent>
      </Popover>
    )
  ) : showFilterButton ? (
    <Button variant="outline" size="icon-sm" className={cn("relative", floatingTarget && "size-9 bg-card")} onClick={openFilter} aria-label={filterLabel} title={filterLabel}>
      <Filter />{showFilterCount && count > 0 && <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{count}</span>}
    </Button>
  ) : null;

  return (
    <div className="rounded-none bg-transparent">
      {isHeaderOwner && createPortal(<div className="flex items-center gap-2"><div className="relative w-40 2xl:w-60"><Search aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" className="h-8 ps-8" aria-label={t("common.search")} placeholder={t("common.searchPlaceholder")} value={searchValue} onChange={(event) => emit(event.target.value)} /></div>{resultCount != null && resultCount !== "" && <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{t("common.resultCount", { count: resultCount })}</span>}{refreshAction && <Button type="button" variant="outline" size="icon-sm" disabled={refreshAction.disabled} onClick={refreshAction.onClick} aria-label={refreshAction.label} title={refreshAction.label}><ActionIcon icon={refreshAction.icon || RefreshCcw} /></Button>}</div>, headerTarget)}
      {floatingTarget && createPortal(<>
        {onPrint && <Button type="button" variant="outline" size="icon-sm" className="size-9 bg-card" onClick={onPrint} aria-label={t("common.print")} title={t("common.print")}><Printer /></Button>}
        {filterControl}
      </>, floatingTarget)}
      {/* ROW 1: search + inline filters + actions (flush inside list card) */}
      <div ref={rowRef} data-slot="list-action-row" className={cn("flex flex-wrap items-center gap-2 p-2 sm:p-3", compact && "sm:gap-3 sm:px-3 sm:py-1")}>
        {leading}
        {/* SEARCH — full width on mobile. With inline filters it takes a fixed
            slot instead of `sm:w-1/2`: five filters plus a half-width search
            box do not fit in one row, and the half is taken from the filters
            that the inline row exists to give space to. */}
        <div
          className={cn(
            "relative min-w-40",
            showInline ? "w-56 shrink-0" : compact ? "w-full sm:w-56 sm:flex-none" : "w-full sm:w-1/2 sm:flex-none",
            searchClassName,
            isHeaderOwner && "xl:hidden",
          )}
        >
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="search"
            className="ps-8 pe-8 focus-visible:shadow-[var(--shadow-soft)]"
            placeholder={t("common.searchPlaceholder")}
            value={searchValue}
            onChange={(e) => emit(e.target.value)}
            aria-label={t("common.search")}
          />
          {searchValue ? (
            <button
              type="button"
              className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={clearSearch}
              aria-label={t("common.clear")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* RESULT COUNT — total matching rows */}
        {resultCount != null && resultCount !== "" ? (
          <span className={cn("inline-flex h-7 shrink-0 items-center rounded-full border border-border/70 bg-muted/50 px-2.5 text-xs font-medium tabular-nums text-muted-foreground", resultCountClassName, isHeaderOwner && "xl:hidden")}>
            {t("common.resultCount", { count: resultCount })}
          </span>
        ) : null}

        {/* INLINE FILTERS — only when they measurably fit. Below the width the
            estimate asks for, the compact dropdown above takes over, so a
            narrow window degrades to one button rather than a wrapped mess. */}
        {showInline ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
            <FilterFields
              config={filterConfig}
              values={selectedFilters || {}}
              onValuesChange={(next) => onApplyFilters?.(next)}
              inline
            />
          </div>
        ) : null}

        {/* ACTIONS — right-aligned; Filter is last (end side) */}
        {/* ACTIONS — right-aligned.
            Inline: content-width + ml-auto, so the FILTER row takes the slack.
            Without the inline row: `flex-1`, which is what pins the cluster to
            the far right when there is free space. Keeping only the first half
            silently left every other list's actions sitting beside the result
            count instead of at the end. */}
        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-end gap-1.5",
            showInline ? "ml-auto" : "flex-1",
          )}
        >
          {extra}

          {onPrint && !floatingTarget && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onPrint}
              aria-label={t("common.print")}
            >
              <Printer />
            </Button>
          )}

          {onExport && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onExport}
              aria-label={t("common.export")}
            >
              <Download />
            </Button>
          )}

          {/* Page actions from setHeader (list mode) — before Filter */}
          <span className={cn("contents", headerActionsClassName)}><HeaderActions actions={headerActions} hideRefreshOnDesktop={isHeaderOwner} refreshLabel={t("common.refresh")} /></span>

          {!floatingTarget && filterControl}
        </div>
      </div>

      {/* ROW 2: applied filter chips */}
      {chips.length > 0 ? (
        <div className="px-2 pb-2 sm:px-3">
          <ActiveFilterChips chips={chips} onClearAll={onClearFilters} />
        </div>
      ) : null}

      {/* Mobile sheet filter surface */}
      {ownsFilter && isMobile ? (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] rounded-none">
            <SheetHeader className="pb-0">
              <SheetTitle>{t("common.filters")}</SheetTitle>
              <SheetDescription className="sr-only">
                {t("common.filters")}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              {panelBody}
            </div>
            <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t border-border/60 pt-3">
              {panelFooter}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
