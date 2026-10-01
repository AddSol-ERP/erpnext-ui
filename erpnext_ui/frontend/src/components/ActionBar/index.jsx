import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Filter, Printer, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { useHeader } from "../../context/HeaderContext";
import { mapVariant } from "../../lib/mapVariant";
import ActiveFilterChips from "../List/ActiveFilterChips";
import FilterFields from "../FilterModal/FilterFields";
import { buildFilterChips } from "../../lib/filterChips";

function ActionIcon({ icon }) {
  if (!icon) return null;
  if (typeof icon === "string") return <i className={icon} />;
  const Icon = icon;
  return <Icon className="size-4" />;
}

/** Page actions from setHeader (New / Refresh / …) as labeled buttons. */
function HeaderActions({ actions }) {
  if (!actions?.length) return null;

  return (
    <>
      {actions.map((action, i) => {
        const map = mapVariant(action.variant);
        return (
          <Button
            key={`${action.label ?? i}-${i}`}
            size="sm"
            variant={map.variant}
            className={map.className}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
          >
            <ActionIcon icon={action.icon} />
            <span className="truncate">{action.label}</span>
          </Button>
        );
      })}
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
}) {
  const { t } = useTranslation();
  const { header, shellMode } = useHeader();
  const isMobile = useIsMobile();
  const isControlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const searchValue = isControlled ? value : inner;
  const onSearchRef = useRef(onSearch);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const headerActions = shellMode === "list" ? header?.actions || [] : [];

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

  return (
    <div className="rounded-none bg-transparent">
      {/* ROW 1: search + actions (flush inside list card) */}
      <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3">
        {/* SEARCH — full width on mobile, ~50% on sm+ */}
        <div className="relative min-w-40 w-full sm:w-1/2 sm:flex-none">
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
          <span className="inline-flex h-7 items-center rounded-full border border-border/70 bg-muted/50 px-2.5 text-xs font-medium tabular-nums text-muted-foreground">
            {t("common.resultCount", { count: resultCount })}
          </span>
        ) : null}

        {/* ACTIONS — right-aligned; Filter is last (end side) */}
        <div className="flex flex-1 shrink-0 flex-wrap items-center justify-end gap-1.5">
          {extra}

          {onPrint && (
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
          <HeaderActions actions={headerActions} />

          {showFilterButton && ownsFilter ? (
            isMobile ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-label={filterLabel}
                aria-expanded={filterOpen}
                onClick={openFilter}
              >
                <Filter />
                {count > 0 ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {count}
                  </span>
                ) : (
                  <span className="sr-only">{t("common.filters")}</span>
                )}
              </Button>
            ) : (
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    aria-label={filterLabel}
                    aria-expanded={filterOpen}
                  >
                    <Filter />
                    <span className="hidden sm:inline">{filterLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-80 rounded-none bg-card p-0"
                >
                  <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
                    {t("common.filters")}
                  </div>
                  <div className="max-h-[min(60vh,420px)] overflow-y-auto p-3">
                    {panelBody}
                  </div>
                  <div className="flex justify-end gap-2 border-t border-border/60 p-2">
                    {panelFooter}
                  </div>
                </PopoverContent>
              </Popover>
            )
          ) : showFilterButton ? (
            <Button
              variant="outline"
              size="icon-sm"
              className="relative"
              onClick={openFilter}
              aria-label={filterLabel}
            >
              <Filter />
              {showFilterCount && count > 0 ? (
                <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </Button>
          ) : null}
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
