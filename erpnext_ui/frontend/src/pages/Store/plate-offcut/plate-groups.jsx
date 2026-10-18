import { Fragment, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../../../components/List/DataTable";
import { cn } from "cn";

/**
 * Plate items awaiting a cut, each expanded to the plates behind it.
 *
 * GROUPING IS THE SERVER'S. `get_available_plates` groups by item_code and pages
 * by item, returning each item's total plate count, total weight, warehouse and
 * heat counts together with its plates. This component renders that shape and
 * nothing more -- it deliberately does NOT regroup.
 *
 * Grouping here instead was wrong in two ways that only appear past the first
 * page: a parent row's count and weight would describe the PAGE rather than the
 * item (twenty-five plates reading as "10"), and an item whose plates straddled
 * a page boundary would appear as two separate groups, so paging forward showed
 * the same item again. The layout still mirrors the Plate Stock Register, whose
 * own grouping is a different concern -- it groups whatever a report returns.
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

/** 245.400 Kg, or a dash when the group has no weight at all. */
function weightLabel(value) {
  return num(value) ? `${num(value).toFixed(3)} Kg` : "\u2014";
}

/** The parent row's right-hand badge: how many of its plates cannot be cut. */
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
 * One plate.
 *
 * A plate that cannot be cut is shown with the reason under its badge and is
 * not clickable: `onSelect` opens the cutting form, and a plate with no recorded
 * weight cannot be cut, so making it a link would only produce a save that fails.
 */
function ChildRow({ plate, onSelect }) {
  const { t } = useTranslation();
  return (
    <TableRow
      className={cn("hover:bg-muted/40", plate.can_cut && "cursor-pointer")}
      onClick={() => {
        if (plate.can_cut) onSelect(plate);
      }}
    >
      <TableCell className="ps-8">
        <span aria-hidden="true" className="text-muted-foreground/40">
          •
        </span>{" "}
        <span className="font-medium">{plate.serial}</span>
        {plate.batch_no && (
          <span className="ms-2 text-xs text-muted-foreground">{plate.batch_no}</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell" />
      <TableCell className="text-end tabular-nums" />
      <TableCell className="text-end tabular-nums">{weightLabel(plate.weight_kg)}</TableCell>
      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
        {plate.warehouse || "\u2014"}
        {plate.heat_number ? ` \u2022 ${plate.heat_number}` : ""}
      </TableCell>
      <TableCell className="text-end">
        {plate.can_cut ? (
          <StatusBadge tone="complete">{t("store.plateOffcut.canCut")}</StatusBadge>
        ) : (
          <span
            className="inline-flex flex-col items-end text-xs text-muted-foreground"
            title={plate.blocked_reason}
          >
            <StatusBadge tone="warning">{t("store.plateOffcut.cannotCut")}</StatusBadge>
            <span className="mt-0.5 max-w-[22ch] truncate">{plate.blocked_reason}</span>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function PlateGroups({ groups, loading, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => new Set());

  const allExpanded = groups.length > 0 && open.size === groups.length;

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setOpen(allExpanded ? new Set() : new Set(groups.map((g) => g.key)));

  if (!loading && !groups.length) return null;

  return (
    <>
      {groups.length > 1 ? (
        <div className="flex items-center justify-end px-3 pt-2">
          <Button size="sm" variant="ghost" onClick={toggleAll} disabled={loading}>
            <ChevronRight className={cn("size-4 transition-transform", allExpanded && "rotate-90")} />
            {allExpanded ? t("reports.collapseAll") : t("reports.expandAll")}
          </Button>
        </div>
      ) : null}

      <div className="px-3 pb-3">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("store.plateOffcut.sourceItem")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("store.plateOffcut.plateSize")}
                </TableHead>
                <TableHead className="text-end">{t("store.plateOffcut.plateCount")}</TableHead>
                <TableHead className="text-end">{t("store.plateOffcut.sourceWeight")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("store.plateOffcut.serial")}
                </TableHead>
                <TableHead className="text-end">{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? null
                : groups.map((group) => {
                    // Same rule as the register: a group holding ONE plate has
                    // nothing to reveal, so it is not a toggle. Making it one
                    // cost a click to reach a single serial, and left the row
                    // looking expandable when expanding it changed nothing.
                    const expandable = group.plate_count > 1;
                    const expanded = expandable && open.has(group.item_code);
                    const blocked = group.blocked_count || 0;

                    return (
                      // Keyed on the fragment, not the first row inside it --
                      // the register does the same, and a bare <> cannot carry
                      // a key at all.
                      <Fragment key={group.item_code}>
                        {expandable ? (
                          <TableRow
                            className="cursor-pointer"
                            aria-expanded={expanded}
                            onClick={() => toggle(group.item_code)}
                          >
                            <TableCell>
                              <div className="flex items-start gap-1.5">
                                <ChevronRight
                                  className={cn(
                                    "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                                    expanded && "rotate-90",
                                  )}
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-medium">
                                    {group.item_code}
                                  </div>
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
                            <TableCell className="hidden lg:table-cell">
                              {/* The serials behind the number, so the count can
                                  be checked without expanding anything. */}
                              <span className="truncate text-xs text-muted-foreground">
                                {group.plates
                                  .slice(0, 3)
                                  .map((p2) => p2.serial)
                                  .join(", ")}
                                {group.plate_count > 3
                                  ? ` +${group.plate_count - 3}`
                                  : ""}
                              </span>
                            </TableCell>
                            <TableCell className="text-end">
                              <GroupStatus blocked={blocked} />
                            </TableCell>
                          </TableRow>
                        ) : null}

                        {/* A lone child is rendered as the row itself, so its
                            serial is one click away instead of two. */}
                        {group.plates.map((plate) =>
                          expanded || !expandable ? (
                            <ChildRow
                              key={plate.serial}
                              plate={plate}
                              onSelect={onSelect}
                            />
                          ) : null,
                        )}
                      </Fragment>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}