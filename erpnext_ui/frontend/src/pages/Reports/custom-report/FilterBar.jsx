import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Filter, RotateCcw, Search } from "lucide-react";
import { getDirection } from "@/i18n";
import FormSelect from "../../../components/FormSelect";
import LinkField from "../../../components/LinkField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "cn";

/**
 * One control for a single declared report filter, chosen by fieldtype.
 *
 * `Report Filter.fieldtype` is a Select restricted to Check / Currency / Data /
 * Date / Datetime / Dynamic Link / Float / Fold / Int / Link / Select / Time
 * (frappe/core/doctype/report_filter/report_filter.json), so a handful of cases
 * covers everything Frappe can express and anything new falls through to a text
 * input rather than rendering nothing.
 */
function FilterControl({ filter, value, onChange }) {
  switch (filter.fieldtype) {
    case "Link":
      // LinkField commits on pick/clear/exact-match only, never per keystroke --
      // which matters because applying a filter re-runs the report.
      return (
        <LinkField
          doctype={filter.options}
          value={value || ""}
          onChange={onChange}
          placeholder={filter.label}
        />
      );

    case "Check":
      // No inline label. `Labelled` already renders `filter.label` above every
      // control, so printing it again showed "Above Tolerance Only" twice and
      // made this row taller than the inputs beside it, which is what knocked the
      // row out of alignment. `h-8` matches the height of the other controls.
      return (
        <label className="flex h-8 cursor-pointer items-center">
          <input
            type="checkbox"
            className="size-4 accent-[var(--brand-primary)]"
            checked={value === 1 || value === "1"}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
            aria-label={filter.label}
          />
        </label>
      );

    case "Select":
      return (
        <FormSelect
          value={value || ""}
          onChange={onChange}
          options={String(filter.options || "")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => ({ value: l, label: l }))}
          placeholder={filter.label}
        />
      );

    case "Date":
      return (
        <Input
          type="date"
          className="h-8"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label={filter.label}
        />
      );

    default:
      return (
        <Input
          className="h-8"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label={filter.label}
        />
      );
  }
}
/**
 * Caption above one control.
 *
 * A `<span>`, not a `<label>`: there is no `htmlFor` and the control is a child
 * of a SIBLING, so a real label here would be attached to nothing — announced by
 * a screen reader as a label with no control, and for a Check it produced two
 * labels stacked on the same field. Every control instead carries
 * `aria-label={filter.label}` (or a placeholder that serves as its name), so the
 * accessible name is intact either way.
 */
function Labelled({ filter, children }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block truncate text-xs font-medium text-muted-foreground">
        {filter.label}
      </span>
      {children}
    </div>
  );
}

/** A filter is "set" if it carries anything other than an empty string. */
function isSet(value) {
  return value !== "" && value !== null && value !== undefined;
}

/**
 * Compact filter bar for a metadata-driven report.
 *
 * Seven filters in a grid ate three rows of vertical space and pushed the table
 * below the fold on a laptop, so the bar now shows only the filters a user
 * reaches for daily and folds the rest into a popover.
 *
 * Two things this deliberately does:
 *
 * - The popover trigger carries a COUNT of set filters that are hidden inside
 *   it. A filter applied inside a collapsed panel is invisible, and "I set a heat
 *   number and nothing happened" is the exact failure this badge prevents.
 * - Apply is repeated INSIDE the popover, so a phone user never has to close the
 *   panel and hunt for the button.
 */
/**
 * Column counts per number of primary filters, at each breakpoint.
 *
 * One row means one row on the desktop: the desktop column count has to equal
 * the number of filters or the last one wraps onto a second line. It used to be
 * a flat `primaryFields.length > 2 && "lg:grid-cols-3"`, so any report declaring
 * FOUR primary filters wrapped -- "Plate Receipt Weight Variance" declares
 * from_date, to_date, supplier and above_tolerance_only.
 *
 * Below `lg` it goes TWO-UP rather than one-per-row: a single column of
 * full-width inputs is unusable on a phone, and with four filters it pushed the
 * results off the screen entirely. One filter stays single, because a half-width
 * date input for a lone filter just looks broken.
 *
 * Every class is written out in full because Tailwind only generates names it can
 * see literally -- `lg:grid-cols-${n}` would generate nothing.
 */
const PRIMARY_GRID_COLS = {
  1: "grid-cols-1 sm:grid-cols-1 lg:grid-cols-1",
  2: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
};

export default function FilterBar({
  declared,
  values,
  onChange,
  primary = [],
  loading,
  onApply,
  onReset,
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const primaryFields = primary.filter((f) => declared.some((d) => d.fieldname === f));
  const primaryNames = new Set(primaryFields);
  const overflow = declared.filter((d) => !primaryNames.has(d.fieldname));
  const hiddenActive = overflow.filter((d) => isSet(values[d.fieldname])).length;

  const handleApply = () => {
    onApply();
    setOpen(false);
  };

  const renderControl = (filter) => (
    <FilterControl
      key={filter.fieldname}
      filter={filter}
      value={values[filter.fieldname]}
      onChange={(v) => onChange(filter.fieldname, v)}
    />
  );

  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
        {/* PRIMARY — two-up on a phone, one row on a desktop. Column counts come
            from PRIMARY_GRID_COLS above. */}
        {primaryFields.length ? (
          <div
            className={cn(
              "grid gap-2",
              PRIMARY_GRID_COLS[Math.min(primaryFields.length, 4)],
              "lg:flex-1",
            )}
          >
            {primaryFields.map((fieldname) => {
              const filter = declared.find((d) => d.fieldname === fieldname);
              return (
                <Labelled key={fieldname} filter={filter}>
                  {renderControl(filter)}
                </Labelled>
              );
            })}
          </div>
        ) : null}

        {/* ACTIONS — always reachable, never inside the collapsed panel only.
            `flex-wrap` so a narrow phone pushes the clear button onto a second
            line instead of clipping it off-screen; `lg:shrink-0` keeps the row
            from being squeezed when it sits beside the filters on desktop. */}
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {overflow.length ? (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <Filter className="size-4" />
                  {t("reports.moreFilters")}
                  {hiddenActive ? (
                    <Badge
                      variant="secondary"
                      className="ms-1 h-5 min-w-5 justify-center px-1"
                    >
                      {hiddenActive}
                    </Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>

              <PopoverContent
                dir={getDirection(i18n.resolvedLanguage || i18n.language)}
                align="start"
                className="w-80 p-3"
              >
                <div className="mb-2 text-sm font-medium">
                  {t("reports.moreFilters")}
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {overflow.map((filter) => (
                    <Labelled key={filter.fieldname} filter={filter}>
                      {renderControl(filter)}
                    </Labelled>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={handleApply}
                  disabled={loading}
                >
                  <Search className="size-4" />
                  {t("reports.applyFilters")}
                </Button>
              </PopoverContent>
            </Popover>
          ) : null}

          <Button size="sm" onClick={onApply} disabled={loading}>
            <Search className="size-4" />
            {t("reports.applyFilters")}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            disabled={loading}
            aria-label={t("reports.clearFilters")}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}