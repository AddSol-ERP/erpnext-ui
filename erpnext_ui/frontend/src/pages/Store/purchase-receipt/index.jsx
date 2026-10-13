import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackagePlus } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import ListLayout from "../../../components/ListLayout";
import ActionBar from "../../../components/ActionBar";
import DataTable from "../../../components/List/DataTable";
import Pagination from "../../../components/Pagination";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { get } from "../../../services/api";

/**
 * Pick a Purchase Order to receive against.
 *
 * PO-first because every receipt this site has ever posted is PO-linked (all 8
 * item rows in the sample data carry a `purchase_order`), and because
 * ERPNext's mapper hands back supplier, currency, warehouse, taxes and every
 * outstanding line already priced and converted.
 *
 * The filter is derived from ERPNext's own status rules rather than guessed --
 * a PO only has something to receive while `per_received < 100`
 * (controllers/status_updater.py). That means `To Receive and Bill` and
 * `To Receive` only; `To Bill`, `Completed`, `Closed`, `On Hold`, `Cancelled`
 * and drafts are excluded because picking them yields an empty receipt.
 *
 * `% received` is shown so what is outstanding is visible *before* clicking.
 */

const PAGE_SIZE = 10;

// Exactly the statuses ERPNext derives from per_received < 100.
const RECEIVABLE_STATUSES = ["To Receive and Bill", "To Receive"];

const STATUS_TONE = {
  "To Receive and Bill": "pending",
  "To Receive": "warning",
};

export default function PurchaseReceiptPicker() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Whether this site insists every receipt line carries a PO. When it does,
  // the "receive without a PO" path cannot save, so it is not offered at all
  // rather than offered and rejected on submit.
  const [poRequired, setPoRequired] = useState(false);

  const loadPoRequired = useCallback(async () => {
    try {
      // frappe.client.get_single_value is whitelisted and permission-checked
      // (frappe/client.py:182), so no app endpoint is needed for this.
      const value = await get(
        "method/frappe.client.get_single_value",
        { doctype: "Buying Settings", field: "po_required" },
      );
      setPoRequired(value.message === "Yes");
    } catch {
      // Assume the stricter rule when the flag cannot be read: hiding a working
      // path is recoverable, offering one that always fails is not.
      setPoRequired(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = JSON.stringify([
        ["docstatus", "=", 1],
        ["status", "in", RECEIVABLE_STATUSES],
      ]);

      const params = {
        fields: JSON.stringify([
          "name",
          "supplier",
          "supplier_name",
          "status",
          "per_received",
          "per_billed",
          "transaction_date",
          "modified",
        ]),
        filters,
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      const orFilters = debouncedSearch
        ? JSON.stringify([
            ["name", "like", `%${debouncedSearch}%`],
            ["supplier", "like", `%${debouncedSearch}%`],
          ])
        : null;
      if (orFilters) params.or_filters = orFilters;

      const countParams = { doctype: "Purchase Order", filters };
      if (orFilters) countParams.or_filters = orFilters;

      const [listRes, countRes] = await Promise.all([
        get("resource/Purchase Order", params),
        get("method/frappe.client.get_count", countParams),
      ]);

      setRows(listRes.data || []);
      setTotal(countRes.message || 0);
    } catch (e) {
      setError(e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    // loadPoRequired only setStates after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPoRequired();
  }, [loadPoRequired]);

  useEffect(() => {
    // loadData only setStates after the awaited response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const openForm = useCallback(
    (po) => navigate(`/store/purchase-receipt/new?po=${encodeURIComponent(po.name)}`),
    [navigate],
  );

  useEffect(() => {
    setHeader({
      title: t("store.receipt.title"),
      subtitle: t("store.receipt.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.receipt.title") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: t("store.receipt.purchaseOrder"),
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.transaction_date}
            </div>
          </div>
        ),
      },
      {
        id: "supplier",
        header: t("store.receipt.supplier"),
        cell: (row) => (
          <span className="truncate text-sm">{row.supplier_name || row.supplier}</span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={STATUS_TONE[row.status] || "open"}>{row.status}</StatusBadge>
        ),
      },
      {
        id: "received",
        header: t("store.receipt.receivedSoFar"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            {Math.round(Number(row.per_received) || 0)}%
          </span>
        ),
      },
      {
        id: "go",
        header: "",
        cell: (row) => (
          <Button size="sm" onClick={() => openForm(row)}>
            {t("store.receipt.receive")}
          </Button>
        ),
      },
    ],
    [t, openForm],
  );

  return (
    <ListLayout
      contentMode="table"
      loading={loading}
      error={error}
      onRetry={loadData}
      actionBar={
        <ActionBar onSearch={setDebouncedSearch} resultCount={total} />
      }
      table={
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.name}
          onRowClick={(row) => openForm(row)}
          loading={loading}
          rowOffset={(page - 1) * PAGE_SIZE}
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
      isEmpty={!loading && rows.length === 0}
      emptyTitle={t("store.receipt.noOrders")}
    >
      {!loading && rows.length === 0 && !poRequired ? (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <PackagePlus className="size-6 text-muted-foreground" />
          <Button onClick={() => navigate("/store/purchase-receipt/new")}>
            {t("store.receipt.withoutOrder")}
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            {t("store.receipt.withoutOrderHint")}
          </p>
        </div>
      ) : null}

      {!loading && rows.length > 0 && !poRequired ? (
        <div className="flex justify-center px-4 py-4">
          <Button variant="outline" onClick={() => navigate("/store/purchase-receipt/new")}>
            {t("store.receipt.withoutOrder")}
          </Button>
        </div>
      ) : null}
    </ListLayout>
  );
}