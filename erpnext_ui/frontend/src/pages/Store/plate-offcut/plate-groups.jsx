import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "../../../components/List/DataTable";
import { cn } from "cn";

/**
 * Plate items awaiting a cut. Clicking one opens its plates.
 *
 * GROUPING AND PAGING ARE THE SERVER'S. `get_available_plates` groups by
 * item_code and pages by item, returning each item's total plate count, total
 * weight, warehouse and heat counts together with its plates. This component
 * renders that shape and nothing more -- it deliberately does NOT regroup.
 *
 * Grouping here instead was wrong in two ways that only appear past the first
 * page: a parent row's count and weight would describe the PAGE rather than the
 * item (twenty-five plates reading as "10"), and an item whose plates straddled
 * a page boundary would appear as two separate groups, so paging forward showed
 * the same item again.
 *
 * The plates live in a side panel rather than expanding in place. An item holds
 * every plate of that mill spec, so expanding one put 25+ rows into the list and
 * pushed the rest of it off screen -- and a scroll region cannot be nested
 * inside it: HTML requires `<tr>` as the direct child of `<tbody>`, so rows
 * cannot wrap themselves in a scrolling div. A panel is the one place a real
 * scrollbar around the plates is possible, and it gives the selection somewhere
 * to land without navigating away from the list first.
 *
 * The layout still mirrors the Plate Stock Register, whose own grouping is a
 * different concern -- it groups whatever a report returns.
 */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 2500 x 1250 x 10 -- only the dimensions that are actually recorded. */
function sizeLabel(row) {
  const length = num(row?.length_mm);
  const width = num(row?.width_mm);
  const thickness = num(row?.thickness_mm);
  if (length && width) return `${length} x ${width}${thickness ? ` x ${thickness}` : ""}`;
  if (thickness) return `${thickness} mm`;
  return "—";
}

/** 245.400 Kg, or a dash when there is no weight at all. */
function weightLabel(value) {
  return num(value) ? `${num(value).toFixed(3)} Kg` : "—";
}

/**
 * The parent row's right-hand badge: how many of its plates cannot be cut.
 *
 * This count is the reason the panel is not a filter. A plate with no recorded
 * weight is a record to fix rather than a plate to cut, and hiding it would
 * leave the operator wondering where their plate went.
 */
function GroupStatus({ blocked }) {
  const { t } = useTranslation();
  return blocked ? (
    <StatusBadge tone="warning">
      <AlertTriangle className="size-3" />
      {t("store.plateOffcut.someCannotCut", { count: blocked })}
    </StatusBadge>
  ) : (
    <StatusBadge tone="open">{t("store.plateOffcut.canCut")}</StatusBadge>
  );
}

/**
 * One plate, inside the panel.
 *
 * ONE LINE per plate. The row used to carry four columns and stack the status
 * badge above its reason, which made every blocked plate two lines tall and
 * pushed the table wide enough to scroll sideways in a panel -- the exact thing
 * a drawer for picking a serial out of must not do. Serial, batch, warehouse
 * and heat now sit on one line and only that line truncates; the weight never
 * wraps. A blocked plate keeps its reason inline as muted text, so it stays one
 * line AND still says why.
 *
 * A plate that cannot be cut is shown with that reason and is not clickable:
 * selecting it opens the cutting form, and a plate with no recorded weight
 * cannot be cut, so making it selectable would only produce a save that fails.
 */
function PlateRow({ plate, onSelect }) {
  const { t } = useTranslation();
  return (
    <TableRow
      className={cn("h-9 hover:bg-muted/40", plate.can_cut && "cursor-pointer")}
      title={plate.can_cut ? undefined : plate.blocked_reason}
      onClick={() => {
        if (plate.can_cut) onSelect(plate);
      }}
    >
      <TableCell className="whitespace-nowrap pe-3">
        {plate.can_cut ? (
          <StatusBadge tone="complete">{t("store.plateOffcut.canCut")}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">{t("store.plateOffcut.cannotCut")}</StatusBadge>
        )}
      </TableCell>
      {/* The only elastic column. Warehouse is the one free-text field here and
          a name like "Stores - Finished Goods" is unbounded, so it is the thing
          that gives; serial, batch and heat are short codes and stay whole. */}
      <TableCell className="truncate">
        <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
          <span className="shrink-0 font-medium">{plate.serial}</span>
          {plate.batch_no && (
            <span className="shrink-0 text-xs text-muted-foreground">{plate.batch_no}</span>
          )}
          {plate.warehouse && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {plate.warehouse}
            </span>
          )}
          {plate.heat_number && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {plate.heat_number}
            </span>
          )}
          {!plate.can_cut && plate.blocked_reason && (
            <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">
              {plate.blocked_reason}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-end tabular-nums ps-3">
        {weightLabel(plate.weight_kg)}
      </TableCell>
    </TableRow>
  );
}

/**
 * The plates behind one item.
 *
 * Bounded at sm:max-w-2xl rather than full width on a desktop: this is a list
 * to pick a serial out of, and a full-width sheet would hide the group list it
 * was opened from. Below `sm` it takes the WHOLE screen, because the
 * primitive's default `w-3/4` leaves a phone around 280px -- too narrow for the
 * rows, which then scrolled sideways. The body scrolls on its own, so a
 * 200-plate item is bounded by the viewport rather than growing the page.
 */
function PlatePanel({ group, onClose, onSelect }) {
  const { t } = useTranslation();
  if (!group) return null;

  return (
    <Sheet open={!!group} onOpenChange={(open) => !open && onClose()}>
      {/* `data-[side=right]:` prefixed deliberately. The primitive sets
          `data-[side=right]:w-3/4 sm:max-w-sm`, and a PLAIN `w-full` would not
          override a variant utility -- both would survive, and on a 375px phone
          the variant won: 75% of the screen, ~281px, which is why four columns
          scrolled sideways. Full width on a phone, a comfortable drawer above. */}
      <SheetContent
        side="right"
        className="flex flex-col data-[side=right]:w-full sm:data-[side=right]:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{group.item_code}</SheetTitle>
          <SheetDescription className="flex flex-wrap gap-x-2">
            {[
              sizeLabel(group),
              t("store.plateOffcut.plateCount", { count: group.plate_count }),
              weightLabel(group.total_weight_kg),
              group.item_group,
            ]
              .filter(Boolean)
              .join(" • ")}
          </SheetDescription>
        </SheetHeader>

        {/* The scroll region. min-h-0 is what lets a flex child actually
            scroll instead of growing its parent past the viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* `table-fixed` is what removes the sideways scroll for good. The
              table is `w-full` and sizes itself from its CONTENT, so one long
              warehouse name widens every row past the drawer and the panel
              scrolls horizontally. Fixed layout takes the width from the column
              definitions instead, and overflow is clipped rather than expanding.
              Without it, `truncate` does not help either: a flex item's default
              `min-width: auto` refuses to shrink below its content. */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[6.5rem] whitespace-nowrap pe-3">
                  {t("common.status")}
                </TableHead>
                <TableHead>{t("store.plateOffcut.serial")}</TableHead>
                <TableHead className="w-[6rem] whitespace-nowrap text-end ps-3">
                  {t("store.plateOffcut.sourceWeight")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.plates.map((plate) => (
                <PlateRow key={plate.serial} plate={plate} onSelect={onSelect} />
              ))}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PlateGroups({ groups, loading, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);

  if (!loading && !groups.length) return null;

  return (
    <>
      <div className="px-3 pb-3">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("store.plateOffcut.sourceItem")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("store.plateOffcut.plateSize")}
                </TableHead>
                <TableHead className="text-end">
                  {t("store.plateOffcut.plateCount")}
                </TableHead>
                <TableHead className="text-end">
                  {t("store.plateOffcut.sourceWeight")}
                </TableHead>
                <TableHead className="text-end">{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? null
                : groups.map((group) => (
                    <TableRow
                      key={group.item_code}
                      className="cursor-pointer"
                      onClick={() => setOpen(group)}
                    >
                      <TableCell>
                        <div className="flex items-start gap-1.5">
                          {/* A chevron, not a toggle: the row opens a panel. */}
                          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{group.item_code}</div>
                            {group.item_group ? (
                              <div className="truncate text-xs text-muted-foreground">
                                {group.item_group}
                              </div>
                            ) : null}
                            <div className="truncate text-xs text-muted-foreground">
                              {[
                                t("store.plateOffcut.warehouseCount", {
                                  count: group.warehouse_count ?? 0,
                                }),
                                t("store.plateOffcut.heatCount", {
                                  count: group.heat_count ?? 0,
                                }),
                              ].join(" • ")}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">
                        {sizeLabel(group)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-medium">
                        {group.plate_count}
                      </TableCell>
                      <TableCell className="text-end tabular-nums font-medium">
                        {weightLabel(group.total_weight_kg)}
                      </TableCell>
                      <TableCell className="text-end">
                        <GroupStatus blocked={group.blocked_count || 0} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <PlatePanel
        group={open}
        onClose={() => setOpen(null)}
        onSelect={(plate) => {
          setOpen(null);
          onSelect(plate);
        }}
      />
    </>
  );
}