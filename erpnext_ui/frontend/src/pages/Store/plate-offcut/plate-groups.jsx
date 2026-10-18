import { Fragment, useMemo, useState } from "react";
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
import { groupRows } from "../../Reports/custom-report/group";

/**
 * The plates waiting to be cut, grouped the way the Plate Stock Register shows
 * plate stock: one row per plate Item, expanding to the individual serials.
 *
 * A flat list of serials is unusable at any real size -- twenty plates of the
 * same 2500x1250x10 mill plate are twenty near-identical rows, and the operator
 * has to read past every one of them to answer "how many have I got, and how
 * much do they weigh". Grouping makes that the parent's own numbers.
 *
 * It also gives "cannot cut" somewhere to live that is not in the way. A plate
 * with no recorded weight is refused by `get_source_details`; it is a record to
 * fix, not a plate to cut, so it appears among its own siblings when the group
 * is opened and is summarised on the parent as a count. Hiding it entirely
 * would leave the operator wondering where their plate went.
 *
 * `groupRows` is the report's own grouping -- pure, and already covered by the
 * rules suite -- rather than a second implementation that could disagree about
 * what "the same item" means.
 */
const GROUP_CONFIG = {
  groupBy: ["item_code"],
  // A serial is unique, so it keys the child on its own; warehouse and heat are
  // carried too so the key stays stable and readable if that ever changes.
  childKey: ["serial", "warehouse", "heat_number"],
  sum: ["weight_kg"],
  // Size comes off the Item, so every serial under one item shares it. Marked
  // `constant` rather than read per child: `constant` takes the first value only
  // when it is unanimous, so a data inconsistency shows as blank, not as a lie.
  constant: ["length_mm", "width_mm", "thickness_mm"],
  mixed: ["item_group"],
  countFields: [
    { field: "warehouse", labelKey: "store.plateOffcut.warehouseCount" },
    { field: "heat_number", labelKey: "store.plateOffcut.heatCount" },
  ],
};

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
function ChildRow({ child, onSelect }) {
  const { t } = useTranslation();
  const { row } = child;
  return (
    <TableRow
      className={cn("hover:bg-muted/40", row.can_cut && "cursor-pointer")}
      onClick={() => {
        if (row.can_cut) onSelect(row);
      }}
    >
      <TableCell className="ps-8">
        <span aria-hidden="true" className="text-muted-foreground/40">
          •
        </span>{" "}
        <span className="font-medium">{row.serial}</span>
        {row.batch_no && (
          <span className="ms-2 text-xs text-muted-foreground">{row.batch_no}</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell" />
      <TableCell className="text-end tabular-nums" />
      <TableCell className="text-end tabular-nums">{weightLabel(row.weight_kg)}</TableCell>
      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
        {row.warehouse || "\u2014"}
        {row.heat_number ? ` \u2022 ${row.heat_number}` : ""}
      </TableCell>
      <TableCell className="text-end">
        {row.can_cut ? (
          <StatusBadge tone="complete">{t("store.plateOffcut.canCut")}</StatusBadge>
        ) : (
          <span
            className="inline-flex flex-col items-end text-xs text-muted-foreground"
            title={row.blocked_reason}
          >
            <StatusBadge tone="warning">{t("store.plateOffcut.cannotCut")}</StatusBadge>
            <span className="mt-0.5 max-w-[22ch] truncate">{row.blocked_reason}</span>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function PlateGroups({ plates, loading, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => new Set());

  const groups = useMemo(() => groupRows(plates, GROUP_CONFIG), [plates]);
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
                    const expandable = group.children.length > 1;
                    const expanded = expandable && open.has(group.key);
                    const blocked = group.children.filter((c) => !c.row.can_cut);

                    return (
                      // Keyed on the fragment, not the first row inside it --
                      // the register does the same, and a bare <> cannot carry
                      // a key at all.
                      <Fragment key={group.key}>
                        {expandable ? (
                          <TableRow
                            className="cursor-pointer"
                            aria-expanded={expanded}
                            onClick={() => toggle(group.key)}
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
                                    {group.labelRow?.item_code || group.label}
                                  </div>
                                  {/* Grade can differ between two batches of the
                                      same item, so it is marked, never guessed. */}
                                  <div className="truncate text-xs text-muted-foreground">
                                    {group.mixedFlags?.item_group
                                      ? t("reports.mixed")
                                      : group.aggregate?.item_group || ""}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {GROUP_CONFIG.countFields
                                      .map(({ field, labelKey }) =>
                                        t(labelKey, { count: group.counts[field] ?? 0 }),
                                      )
                                      .join(" • ")}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden tabular-nums md:table-cell">
                              {sizeLabel(group.aggregate)}
                            </TableCell>
                            <TableCell className="text-end tabular-nums font-medium">
                              {group.children.length}
                            </TableCell>
                            <TableCell className="text-end tabular-nums font-medium">
                              {weightLabel(group.aggregate?.weight_kg)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {/* The serials behind the number, so the count can
                                  be checked without expanding anything. */}
                              <span className="truncate text-xs text-muted-foreground">
                                {group.children
                                  .slice(0, 3)
                                  .map((c) => c.row.serial)
                                  .join(", ")}
                                {group.children.length > 3
                                  ? ` +${group.children.length - 3}`
                                  : ""}
                              </span>
                            </TableCell>
                            <TableCell className="text-end">
                              <GroupStatus blocked={blocked.length} />
                            </TableCell>
                          </TableRow>
                        ) : null}

                        {/* A lone child is rendered as the row itself, so its
                            serial is one click away instead of two. */}
                        {group.children.map((child) =>
                          expanded || !expandable ? (
                            <ChildRow
                              key={child.key}
                              child={child}
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