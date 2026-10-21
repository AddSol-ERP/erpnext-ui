import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackagePlus, Trash2 } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import ListLayout from "../../../components/ListLayout";
import ActionBar from "../../../components/ActionBar";
import DataTable from "../../../components/List/DataTable";
import Pagination from "../../../components/Pagination";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import { get } from "../../../services/api";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { deleteDocument } from "../../../lib/docTransition";
import LinkField from "../../../components/LinkField";

/**
 * Pick a supplier, then a Purchase Order to receive against.
 *
 * Starting with a supplier narrows the receiving queue to the supplier the
 * truck belongs to. ERPNext's Purchase Receipt mapper still supplies currency,
 * warehouse, taxes and every outstanding line already priced and converted.
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
  const [drafts, setDrafts] = useState([]);
  const [draftTotal, setDraftTotal] = useState(0);
  const [draftPage, setDraftPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftLoading, setDraftLoading] = useState(true);
  const [submitted, setSubmitted] = useState([]);
  const [submittedTotal, setSubmittedTotal] = useState(0);
  const [submittedPage, setSubmittedPage] = useState(1);
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [submittedLoading, setSubmittedLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Whether this site insists every receipt line carries a PO. When it does,
  // the "receive without a PO" path cannot save, so it is not offered at all
  // rather than offered and rejected on submit.
  const [poRequired, setPoRequired] = useState(false);
  const [supplier, setSupplier] = useState("");

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
        ...(supplier ? [["supplier", "=", supplier]] : []),
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

      if (!supplier) {
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
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
  }, [debouncedSearch, page, supplier]);

  const loadSubmitted = useCallback(async () => {
    setSubmittedLoading(true);
    const filters = JSON.stringify([["docstatus", "=", 1]]);
    const orFilters = submittedSearch
      ? JSON.stringify([
          ["name", "like", `%${submittedSearch}%`],
          ["supplier", "like", `%${submittedSearch}%`],
        ])
      : null;
    try {
      const [listRes, countRes] = await Promise.all([
        get("resource/Purchase Receipt", {
          fields: JSON.stringify(["name", "supplier", "supplier_name", "posting_date", "status", "modified"]),
          filters,
          ...(orFilters ? { or_filters: orFilters } : {}),
          order_by: "modified desc",
          limit_start: (submittedPage - 1) * PAGE_SIZE,
          limit_page_length: PAGE_SIZE,
        }),
        get("method/frappe.client.get_count", {
          doctype: "Purchase Receipt",
          filters,
          ...(orFilters ? { or_filters: orFilters } : {}),
        }),
      ]);
      setSubmitted(listRes.data || []);
      setSubmittedTotal(Number(countRes.message) || 0);
    } catch {
      setSubmitted([]);
      setSubmittedTotal(0);
    } finally {
      setSubmittedLoading(false);
    }
  }, [submittedPage, submittedSearch]);

  const loadDrafts = useCallback(async () => {
    setDraftLoading(true);
    const filters = JSON.stringify([["docstatus", "=", 0]]);
    const orFilters = draftSearch
      ? JSON.stringify([
          ["name", "like", `%${draftSearch}%`],
          ["supplier", "like", `%${draftSearch}%`],
        ])
      : null;
    try {
      const [listRes, countRes] = await Promise.all([
        get("resource/Purchase Receipt", {
          fields: JSON.stringify(["name", "supplier", "supplier_name", "posting_date", "modified"]),
          filters,
          ...(orFilters ? { or_filters: orFilters } : {}),
          order_by: "modified desc",
          limit_start: (draftPage - 1) * PAGE_SIZE,
          limit_page_length: PAGE_SIZE,
        }),
        get("method/frappe.client.get_count", {
          doctype: "Purchase Receipt",
          filters,
          ...(orFilters ? { or_filters: orFilters } : {}),
        }),
      ]);
      setDrafts(listRes.data || []);
      setDraftTotal(Number(countRes.message) || 0);
    } catch {
      // The PO queue remains usable if this user cannot list existing receipts.
      setDrafts([]);
      setDraftTotal(0);
    } finally {
      setDraftLoading(false);
    }
  }, [draftPage, draftSearch]);

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

  useEffect(() => {
    // The loader synchronizes with the server and updates state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDrafts();
    loadSubmitted();
  }, [loadDrafts, loadSubmitted]);

  const confirmDeleteDraft = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteDocument({ doctype: "Purchase Receipt", name: deleteTarget.name });
      setDeleteTarget(null);
      if (draftPage > 1 && drafts.length === 1) {
        setDraftPage((current) => Math.max(1, current - 1));
      } else {
        await loadDrafts();
      }
    } catch (e) {
      setDeleteError(e.message || t("common.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

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
  const draftTotalPages = Math.max(1, Math.ceil(draftTotal / PAGE_SIZE));
  const submittedTotalPages = Math.max(1, Math.ceil(submittedTotal / PAGE_SIZE));

  const receiptTabs = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2">
      {[
        ["orders", t("store.receipt.receiveQueueTab")],
        ["drafts", t("store.receipt.draftsTab")],
        ["submitted", t("store.receipt.submittedTab")],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setActiveTab(value)}
          aria-current={activeTab === value ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === value
              ? "bg-primary/15 text-primary ring-1 ring-primary/40"
              : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

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
    <div className="flex flex-col gap-4">
    {activeTab === "orders" ? <ListLayout
      contentMode="table"
      loading={loading}
      error={error}
      onRetry={loadData}
      tabs={receiptTabs}
      actionBar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("store.receipt.supplier")}</label>
            <LinkField doctype="Supplier" value={supplier} onChange={(value) => { setSupplier(value); setPage(1); }} placeholder={t("store.receipt.selectSupplier")} />
          </div>
          <ActionBar onSearch={(value) => { setDebouncedSearch(value); setPage(1); }} resultCount={total} />
        </div>
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
      emptyTitle={supplier ? t("store.receipt.noOrders") : t("store.receipt.selectSupplier")}
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
    </ListLayout> : null}
    {activeTab === "drafts" ? <ListLayout
      contentMode="children"
      loading={draftLoading}
      tabs={receiptTabs}
      actionBar={<ActionBar defaultValue={draftSearch} onSearch={(value) => { setDraftSearch(value); setDraftPage(1); }} resultCount={draftTotal} />}
      pagination={
        <Pagination
          currentPage={draftPage}
          totalPages={draftTotalPages}
          onPageChange={setDraftPage}
          totalItems={draftTotal}
          pageSize={PAGE_SIZE}
          disabled={draftLoading}
        />
      }
    >
    <ConfirmDialog
      open={!!deleteTarget}
      loading={deleting}
      title={t("store.receipt.deleteDraftTitle")}
      message={t("common.deleteConfirm", { name: deleteTarget?.name || "" })}
      onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      onConfirm={confirmDeleteDraft}
    />
    {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
    <div>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("store.receipt.draftReceipts")}</h2>
          <p className="text-xs text-muted-foreground">{t("store.receipt.draftReceiptsHint")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadDrafts} disabled={draftLoading}>
          {draftLoading ? t("common.loading") : t("common.refresh")}
        </Button>
      </div>
      {drafts.length ? (
        <ul className="divide-y divide-border/60">
          {drafts.map((draft) => (
            <li key={draft.name} className="flex items-center gap-2 px-4 py-1">
              <button
                type="button"
                onClick={() => navigate(`/store/purchase-receipt/${encodeURIComponent(draft.name)}`)}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-accent/50"
              >
                <span>
                  <span className="block text-sm font-medium">{draft.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {draft.supplier_name || draft.supplier} · {draft.posting_date || "—"}
                  </span>
                </span>
                <span className="text-xs font-medium text-primary">{t("store.receipt.resumeDraft")}</span>
              </button>
              <Button variant="ghost" size="icon" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => setDeleteTarget(draft)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {draftLoading ? t("common.loading") : t("store.receipt.noDraftReceipts")}
        </p>
      )}
    </div>
    </ListLayout> : null}
    {activeTab === "submitted" ? <ListLayout
      contentMode="children"
      loading={submittedLoading}
      tabs={receiptTabs}
      actionBar={<ActionBar defaultValue={submittedSearch} onSearch={(value) => { setSubmittedSearch(value); setSubmittedPage(1); }} resultCount={submittedTotal} />}
      pagination={
        <Pagination
          currentPage={submittedPage}
          totalPages={submittedTotalPages}
          onPageChange={setSubmittedPage}
          totalItems={submittedTotal}
          pageSize={PAGE_SIZE}
          disabled={submittedLoading}
        />
      }
    >
    <div>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("store.receipt.submittedReceipts")}</h2>
          <p className="text-xs text-muted-foreground">{t("store.receipt.submittedReceiptsHint")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSubmitted} disabled={submittedLoading}>
          {submittedLoading ? t("common.loading") : t("common.refresh")}
        </Button>
      </div>
      {submitted.length ? (
        <ul className="divide-y divide-border/60">
          {submitted.map((receipt) => (
            <li key={receipt.name}>
              <button type="button" onClick={() => navigate(`/store/purchase-receipt/${encodeURIComponent(receipt.name)}`)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent/50">
                <span>
                  <span className="block text-sm font-medium">{receipt.name}</span>
                  <span className="block text-xs text-muted-foreground">{receipt.supplier_name || receipt.supplier} · {receipt.posting_date || "—"}</span>
                </span>
                <span className="text-xs font-medium text-primary">{t("store.receipt.viewReceipt")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">{submittedLoading ? t("common.loading") : t("store.receipt.noSubmittedReceipts")}</p>
      )}
    </div>
    </ListLayout> : null}
    </div>
  );
}
