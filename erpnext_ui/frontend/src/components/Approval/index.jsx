import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Hourglass,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import { useRole } from "../../context/RoleContext";
import { useNavigate } from "react-router-dom";
import {
  APPROVAL_QUEUE_DOCTYPES,
  getApprovalQueues,
  queueFor,
} from "../../lib/approvalQueues";
import DashboardShell from "../dashboard/DashboardShell";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { gridCorners } from "../../lib/gridCorners";

const GRID_BREAKPOINTS = [{ cols: 1 }, { min: "sm", cols: 2 }, { min: "lg", cols: 3 }];

/**
 * Presentation only: which icon and label each approval doctype gets, and the
 * order they fall back to. The COUNTS and the state names that produce them
 * come from the server (`lib/approvalQueues.js`) -- the old `pendingStatus`
 * entries here are what made every tile read zero, because none of these
 * doctypes has a `status` of "Pending".
 */
const TILE_CONFIG = {
  "Purchase Order": {
    labelKey: "approvals.tiles.purchaseOrders",
    icon: ShoppingBag,
  },
  "Expense Claim": {
    labelKey: "approvals.tiles.expenses",
    icon: Receipt,
  },
  "Leave Application": {
    labelKey: "approvals.tiles.leaves",
    icon: CalendarCheck,
  },
  "Attendance Request": {
    labelKey: "approvals.tiles.attendanceRequests",
    icon: ClipboardCheck,
  },
  Quotation: {
    labelKey: "approvals.tiles.quotations",
    icon: FileText,
  },
  "Overtime Log": {
    labelKey: "approvals.tiles.overtimeLogs",
    icon: Hourglass,
  },
};

const APPROVAL_DOCTYPES = APPROVAL_QUEUE_DOCTYPES.map((doctype) => ({
  doctype,
  ...TILE_CONFIG[doctype],
}));

const TILE_BADGE = {
  danger: "bg-destructive/15 text-destructive ring-destructive/30",
  warning: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  success:
    "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
};

function getStatusClass(pending) {
  if (pending > 10) return "danger";
  if (pending > 0) return "warning";
  return "success";
}

function ApprovalTile({ tile, onClick, className = "" }) {
  const { t } = useTranslation();
  const status = getStatusClass(tile.pending);
  const Icon = tile.icon;

  return (
    <div
      className={`group flex h-full cursor-pointer flex-col bg-card p-4 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/40 ${className}`}
      onClick={() => onClick(tile.doctype)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(tile.doctype);
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="truncate text-sm font-semibold">
            {t(tile.labelKey)}
          </div>
        </div>

        {tile.pending > 0 && (
          <Badge variant="outline" className={TILE_BADGE[status]}>
            {tile.pending}
          </Badge>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between">
        <div>
          <div className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {tile.pending}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("approvals.pending")}
          </div>
        </div>

        <div className="text-end">
          <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {tile.approved}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("approvals.approved")}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- MAIN PAGE ---------------- */

export default function Approval() {
  const { setHeader } = useHeader();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [queues, setQueues] = useState({ totalPending: 0, doctypes: {} });
  const [loading, setLoading] = useState(true);

  // Real doctype read permissions. RoleContext defaults this to empty and only
  // populates it from erpnext_ui.api.get_ui_access, which reads
  // frappe.has_permission(doctype, "read"). Until it resolves we show the
  // skeleton rather than an empty page, so the hub does not flash.
  const { canReadApprovalDoctype, loading: rolesLoading } = useRole();

  const accessibleDoctypes = APPROVAL_DOCTYPES.filter((item) =>
    canReadApprovalDoctype(item.doctype),
  );

  // Presentation config + the server's counts, sorted by what the reader came
  // for. The counting itself lives in `api.py:get_approval_queues`, which reads
  // the states off each Workflow -- a "Pending" status value guessed here is
  // exactly what made every tile read zero.
  const tiles = accessibleDoctypes
    .map((item) => ({ ...item, ...queueFor(queues, item.doctype) }))
    .sort((a, b) => b.pending - a.pending);

  useEffect(() => {
    setHeader({
      title: t("nav.approvals"),
      subtitle: t("approvals.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.approvals") },
      ],
    });

    return () => setHeader({});
    // setHeader is stable from HeaderContext; only the locale should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Fetch counts once permissions are known, and again if they change (e.g. an
  // admin edits the user's roles and hits refresh). Keyed on a joined string
  // rather than the array itself, which is a fresh reference every render and
  // would refetch forever.
  const accessKey = accessibleDoctypes.map((item) => item.doctype).join("|");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const data = await getApprovalQueues();
      if (cancelled) return;
      setQueues(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessKey, rolesLoading]);

  return (
    <DashboardShell>

      {loading || rolesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card
              key={i}
              className={gridCorners({
                breakpoints: GRID_BREAKPOINTS,
                index: i,
                count: 6,
              })}
            >
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-11 rounded-xl" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-10 w-16" />
                  <Skeleton className="h-10 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !tiles.length ? (
        // Every doctype here is withheld, so this user cannot approve anything.
        // Say so plainly instead of rendering an empty grid, which looks like a
        // loading failure.
        <Empty className="border">
          <EmptyHeader>
            <Lock className="size-6 text-muted-foreground" />
            <EmptyTitle>{t("approvals.noAccessTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("approvals.noAccessHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile, i) => (
            <ApprovalTile
              key={tile.doctype}
              tile={tile}
              className={gridCorners({
                breakpoints: GRID_BREAKPOINTS,
                index: i,
                count: tiles.length,
              })}
              onClick={(doctype) =>
                navigate(`/approvals/${encodeURIComponent(doctype)}`)
              }
            />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
