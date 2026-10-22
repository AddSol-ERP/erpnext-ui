import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { get } from "../../../services/api";
import ListLayout from "../../../components/ListLayout";
import DataTable, { StatusBadge } from "../../../components/List/DataTable";
import ActionBar from "../../../components/ActionBar";
import { Button } from "@/components/ui/button";
import Pagination from "../../../components/Pagination";

const DOCTYPE = "Plate Offcut";
const PAGE_SIZE = 10;

// Every entry must exist on the doctype. There is no `_name` pseudo-field: a
// Link stores the *code* in its own column and Frappe materialises no
// `source_item_name` beside it, so asking for one fails the WHOLE query with
// "Field not permitted in query" -- not just that column. Verified against
// plates/doctype/plate_offcut/plate_offcut.json.
const FIELDS = [
  "name",
  "source_item",
  "project",
  "warehouse",
  "heat_number",
  "total_offcut_weight_kg",
  "total_offcut_value",
  "scrap_weight_kg",
  "consumed_weight_kg",
  "consumed_value",
  "creation",
  "modified",
  "docstatus",
];

/**
 * The cutting jobs themselves -- one Plate Offcut document per plate.
 *
 * A third tab rather than a replacement for the first two: the tabs answer "what
 * can I cut" and "what did I make", and neither shows the document that recorded
 * a given cut, which is where scrap and the over/short check live.
 */
export default function CuttingJobs({ tabs }) {
  // The hub passes its scope strip down rather than wrapping these panels:
  // ListLayout draws `tabs` as a strip inside its OWN card, so a panel that
  // rendered its own without it would lose the strip, and a hub that wrapped
  // them would produce two nested elevated cards.
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const term = search.trim();
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
  }, [search, page, t]);

  useEffect(() => {
    // `load` setStates only after an awaited API response; the rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        // Read what FIELDS actually fetched. A column reading a field that was
        // never requested is not an error -- it silently renders the fallback
        // forever, so the column looks plausible while showing nothing.
        cell: (row) => <span className="truncate text-sm">{row.source_item || "—"}</span>,
      },
      {
        id: "warehouse",
        header: t("store.plateOffcut.warehouse"),
        hideBelow: "md",
        cell: (row) => <span className="truncate text-sm">{row.warehouse || "—"}</span>,
      },
      {
        id: "project",
        header: t("store.plateOffcut.project"),
        hideBelow: "md",
        cell: (row) => <span className="truncate text-sm">{row.project || "—"}</span>,
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
        id: "scrap_weight_kg",
        header: t("store.plateOffcut.scrapWeight"),
        hideBelow: "lg",
        cell: (row) => <span className="text-end tabular-nums">{row.scrap_weight_kg != null ? `${row.scrap_weight_kg} Kg` : "—"}</span>,
      },
      {
        id: "consumed_weight_kg",
        header: t("store.plateOffcut.projectRemainderWeight"),
        hideBelow: "xl",
        cell: (row) => <span className="text-end tabular-nums">{row.consumed_weight_kg != null ? `${row.consumed_weight_kg} Kg` : "—"}</span>,
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
  <ListLayout
      tabs={tabs}
      loading={loading}
      error={error}
      onRetry={load}
      isEmpty={!loading && rows.length === 0}
      emptyTitle={t("store.plateOffcut.emptyTitle")}
      emptyDescription={t("store.plateOffcut.emptyDescription")}
      emptyAction={
        <Button onClick={() => navigate("/store/plate-offcut/new")}>
          {t("store.plateOffcut.newTitle")}
        </Button>
      }
      actionBar={
        <ActionBar
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          resultCount={total}
        />
      }
      pagination={
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          pageSize={PAGE_SIZE}
          disabled={loading}
        />
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
);
}
