import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  FileText,
  Hourglass,
  Inbox,
  Receipt,
  ShoppingBag,
} from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import { useNavigate } from "react-router-dom";
import { get } from "../../services/api";
import DashboardShell from "../dashboard/DashboardShell";
import DashboardHero from "../dashboard/DashboardHero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { gridCorners } from "../../lib/gridCorners";
import {
  getApprovalMeta,
  resolveStatusField,
} from "../../lib/approvalMeta";

const GRID_BREAKPOINTS = [{ cols: 1 }, { min: "sm", cols: 2 }, { min: "lg", cols: 3 }];

const APPROVAL_DOCTYPES = [
  {
    doctype: "Purchase Order",
    labelKey: "approvals.tiles.purchaseOrders",
    icon: ShoppingBag,
  },
  {
    doctype: "Expense Claim",
    labelKey: "approvals.tiles.expenses",
    icon: Receipt,
  },
  {
    doctype: "Leave Application",
    labelKey: "approvals.tiles.leaves",
    icon: CalendarCheck,
  },
  {
    doctype: "Quotation",
    labelKey: "approvals.tiles.quotations",
    icon: FileText,
  },
  {
    doctype: "Overtime Log",
    labelKey: "approvals.tiles.overtimeLogs",
    icon: Hourglass,
    pendingStatus: "Draft",
  },
];

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
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovalData = async () => {
    setLoading(true);
    try {
      const fetchedTiles = await Promise.all(
        APPROVAL_DOCTYPES.map(async (item) => {
          try {
            const pendingStatus = item.pendingStatus || "Pending";

            // ERPNext keeps the approval outcome in `status`, except on Expense
            // Claim where it is `approval_status`. Resolve from meta so the
            // counts don't silently read a column that doesn't exist.
            const meta = await getApprovalMeta(item.doctype);
            const statusField = resolveStatusField(meta, item.doctype);

            const pendingRes = await get("method/frappe.client.get_count", {
              doctype: item.doctype,
              filters: JSON.stringify({ [statusField]: pendingStatus }),
            });

            const approvedRes = await get("method/frappe.client.get_count", {
              doctype: item.doctype,
              filters: JSON.stringify({ [statusField]: "Approved" }),
            });

            return {
              key: item.doctype,
              doctype: item.doctype,
              labelKey: item.labelKey,
              icon: item.icon,
              pending: pendingRes.message || 0,
              approved: approvedRes.message || 0,
            };
          } catch (error) {
            console.error(`Failed to fetch ${item.doctype}:`, error);
            return {
              key: item.doctype,
              doctype: item.doctype,
              labelKey: item.labelKey,
              icon: item.icon,
              pending: 0,
              approved: 0,
            };
          }
        }),
      );

      fetchedTiles.sort((a, b) => b.pending - a.pending);
      setTiles(fetchedTiles);
    } catch (error) {
      console.error("Failed to fetch approval data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHeader({
      title: t("nav.approvals"),
      subtitle: t("approvals.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.approvals") },
      ],
    });

    // fetchApprovalData only setStates after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApprovalData();

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardShell>
      <DashboardHero
        icon={Inbox}
        description={t("approvals.subtitle")}
      />

      {loading ? (
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
