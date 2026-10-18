import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { get } from "../../../services/api";
import { useHeader } from "../../../context/HeaderContext";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import ListLayout from "../../../components/ListLayout";
import DataTable, { StatusBadge } from "../../../components/List/DataTable";
import { Button } from "@/components/ui/button";
import Pagination from "../../../components/Pagination";

const DOCTYPE = "Plate Offcut";
const PAGE_SIZE = 20;

const FIELDS = [
  "name",
  "source_item",
  "source_item_name",
  "warehouse",
  "heat_number",
  "total_offcut_weight_kg",
  "total_offcut_value",
  "creation",
  "modified",
  "docstatus",
];

export default function PlateOffcutList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const term = applied.trim();
    const filters = term ? [["name", "like", `%${term}%`]] : null;
    try {
      const [listRes, countRes] = await Promise.all([
        get(`resource/${encodeURIComponent(DOCTYPE)}`, {
          fields: JSON.stringify(FIELDS),
          filters,
          order_by: "modified desc",
          limit_start: (page - 1) * PAGE_SIZE,
          limit_page_length: PAGE_SIZE,
        }),
        get("method/frappe.client.get_count", {
          doctype: DOCTYPE,
          filters,
        }),
      ]);
      setRows(listRes.data || []);
      setTotal(countRes.message ?? 0);
    } catch (e) {
      setError(e.message || t("common.failedToLoad", { name: DOCTYPE }));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [applied, page, t]);

  useEffect(() => {
    // `load` setStates only after an awaited API response; the rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    setHeader({
      title: t("store.plateOffcut.title"),
      subtitle: t("store.plateOffcut.listSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.plateOffcut.title") },
      ],
      actions: [
        {
          label: t("store.plateOffcut.newTitle"),
          variant: "btn-primary",
          icon: Plus,
          onClick: () => navigate("/store/plate-offcut/new"),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("store.plateOffcut.number"),
        cell: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        id: "source_item",
        header: t("store.plateOffcut.sourceItem"),
        cell: (row) => (
          <span className="truncate text-sm">
            {row.source_item_name || row.source_item || "—"}
          </span>
        ),
      },
      {
        id: "warehouse",
        header: t("store.plateOffcut.warehouse"),
        hideBelow: "md",
        cell: (row) => <span className="truncate text-sm">{row.warehouse || "—"}</span>,
      },
      {
        id: "heat_number",
        header: t("store.plateOffcut.heatNumber"),
        hideBelow: "lg",
        cell: (row) => <span className="text-sm text-muted-foreground">{row.heat_number || "—"}</span>,
      },
      {
        id: "total_offcut_weight_kg",
        header: t("store.plateOffcut.totalOffcutWeight"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-end tabular-nums">
            {row.total_offcut_weight_kg
              ? `${row.total_offcut_weight_kg} Kg`
              : "—"}
          </span>
        ),
      },
      {
        id: "total_offcut_value",
        header: t("store.plateOffcut.totalOffcutValue"),
        cell: (row) => (
          <span className="text-end tabular-nums">
            {row.total_offcut_value != null
              ? Number(row.total_offcut_value).toFixed(2)
              : "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => {
          const label =
            row.docstatus === 1
              ? t("common.submitted")
              : row.docstatus === 2
                ? t("common.cancelled")
                : t("common.draft");
          // Tones are the shared set in components/List/statusTones.js:
          // open | pending | complete | danger | info | warning. Anything else
          // silently falls back to the grey "open" badge, so these must be exact.
          const tone =
            row.docstatus === 1 ? "complete" : row.docstatus === 2 ? "danger" : "open";
          return <StatusBadge tone={tone}>{label}</StatusBadge>;
        },
      },
    ],
    [t],
  );

  return (
    <DashboardShell>
      <ListLayout
        loading={loading}
        error={error}
        onRetry={load}
        isEmpty={!loading && rows.length === 0}
        emptyTitle={t("store.plateOffcut.emptyTitle")}
        emptyDescription={t("store.plateOffcut.emptyDescription")}
        emptyAction={
          <Button onClick={() => navigate("/store/plate-offcut/new")}>
            <Plus className="size-4" />
            {t("store.plateOffcut.newTitle")}
          </Button>
        }
        actionBar={
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setApplied(search)}
              placeholder={t("store.plateOffcut.searchPlaceholder")}
              aria-label={t("store.plateOffcut.searchPlaceholder")}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            />
            <Button size="sm" onClick={() => { setApplied(search); setPage(1); }}>
              {t("common.search")}
            </Button>
          </div>
        }
        pagination={
          total > PAGE_SIZE ? (
            <Pagination
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              disabled={loading}
            />
          ) : null
        }
      >
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          onRowClick={(row) =>
            navigate(`/store/plate-offcut/${encodeURIComponent(row.name)}`)
          }
        />
      </ListLayout>
    </DashboardShell>
  );
}
