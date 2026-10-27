import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, RefreshCw, Settings2 } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { useRole } from "../../../context/RoleContext";
import { get } from "../../../services/api";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import LinkField from "../../../components/LinkField";
import Pagination from "../../../components/Pagination";
import useListPagination from "../../../hooks/useListPagination";
import { REFERENCE_TYPES } from "../../../lib/inspectionTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localDateISO } from "../../../utils/localDateTime";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const ENDPOINT = "method/erpnext_ui.api.get_pending_inspection_items";

const fmtQty = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });

const fmtMoney = (value, currency) => {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!currency) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
};

/**
 * Items still awaiting Incoming Quality Inspection, across accessible warehouses.
 *
 * The warehouse filter is optional. With it blank, all warehouses the current
 * user can read are included. The API checks completed inspections against the
 * exact source reference and item/batch/serial scope.
 */
export default function InspectionPendingReport() {
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const { userRoles = [] } = useRole();
  const navigate = useNavigate();
  const canConfigure =
    userRoles.includes("System Manager") || userRoles.includes("Administrator");

  const [warehouse, setWarehouse] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [serialNo, setSerialNo] = useState("");
  const [asOfDate, setAsOfDate] = useState(() => localDateISO());
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Rapid filter changes can leave an older response in flight. Without this
  // guard it can overwrite the rows for the latest filter selection.
  const requestId = useRef(0);
  const warehouseDefaultApplied = useRef(false);

  const {
    page,
    setPage,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    limit_start,
    limit_page_length,
    setPageSize,
  } = useListPagination({ pageSize: 50 });

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await get(ENDPOINT, {
        warehouse: warehouse || "",
        item_code: itemCode || "",
        batch_no: batchNo || "",
        serial_no: serialNo || "",
        as_of_date: asOfDate,
        start: limit_start,
        limit: limit_page_length,
      });
      if (id !== requestId.current) return;
      const payload = res.message || {};
      setRows(payload.rows || []);
      setMeta(payload);
      setTotal(payload.total || 0);
      if (!warehouseDefaultApplied.current) {
        warehouseDefaultApplied.current = true;
        if (payload.default_warehouse &&
            (payload.available_warehouses || []).includes(payload.default_warehouse)) {
          setWarehouse(payload.default_warehouse);
        }
      }

    } catch (e) {
      if (id !== requestId.current) return;
      setError(e);
      setRows([]);
      setMeta({});
      setTotal(0);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [
    batchNo,
    asOfDate,
    itemCode,
    limit_page_length,
    limit_start,
    serialNo,
    setTotal,
    warehouse,
  ]);

  useEffect(() => {
    // load() sets loading before its awaited request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    setHeader({
      title: t("store.inspectionPending.title"),
      subtitle: t("store.inspectionPending.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.inspectionPending.title") },
      ],
      actions: [
        ...(canConfigure
          ? [
              {
                label: t("store.inspectionPending.configure"),
                variant: "btn-outline-primary",
                icon: Settings2,
                onClick: () => navigate("/quality/inspection-settings"),
              },
            ]
          : []),
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          icon: RefreshCw,
          disabled: loading,
          onClick: load,
        },
      ],
    });
    return () => setHeader({});
  }, [canConfigure, load, loading, navigate, setHeader, t]);

  const changeWarehouse = (next) => {
    setWarehouse(next);
    // Batch and serial can belong to different stock in another warehouse;
    // clear them when the warehouse scope changes.
    setBatchNo("");
    setSerialNo("");
    resetPage();
  };

  const changeItem = (next) => {
    setItemCode(next);
    setBatchNo("");
    setSerialNo("");
    resetPage();
  };

  const changeBatch = (next) => {
    setBatchNo(next);
    // A serial belongs to a batch. Changing the batch must not leave a serial
    // from the previous one ANDed into the request.
    setSerialNo("");
    resetPage();
  };

  const changeSerial = (next) => {
    setSerialNo(next);
    resetPage();
  };

  const changeAsOfDate = (event) => {
    setAsOfDate(event.target.value || localDateISO());
    resetPage();
  };

  /**
   * Open a new Quality Inspection for this stock line.
   *
   * A batch or serial row names exactly what has to be inspected, but the
   * Quality Inspection doctype also requires a reference document. The API
   * returns the last positive SLE's voucher when it can establish one; an
   * unsupported or missing voucher is omitted rather than posted as an invalid
   * Dynamic Link, and the user can still choose a reference in the form.
   */
  const inspectRow = (row) => {
    const params = new URLSearchParams({
      item_code: row.item_code,
      inspection_type: "Incoming",
    });
    if (row.batch_no) params.set("batch_no", row.batch_no);
    if (row.serial_no) params.set("item_serial_no", row.serial_no);
    if (REFERENCE_TYPES.includes(row.reference_type) && row.reference_name) {
      params.set("reference_type", row.reference_type);
      params.set("reference_name", row.reference_name);
    }
    navigate(`/quality/inspection/new?${params.toString()}`);
  };

  const hasWarehouse = Boolean(meta.configured || meta.all_warehouses || meta.warehouse);
  const canRenderTable = !error && hasWarehouse;

  return (
    <DashboardShell>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("store.inspectionPending.warehouse")}
            </label>
            <Select
              value={warehouse || "__all_warehouses__"}
              onValueChange={(next) =>
                changeWarehouse(next === "__all_warehouses__" ? "" : next)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("store.inspectionPending.allWarehouses")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_warehouses__">
                  {t("store.inspectionPending.allWarehouses")}
                </SelectItem>
                {(meta.available_warehouses || []).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("store.filters.item")}
            </label>
            <LinkField
              doctype="Item"
              value={itemCode}
              onChange={changeItem}
              placeholder={t("store.filters.item")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("store.inspectionPending.batch")}
            </label>
            <LinkField
              doctype="Batch"
              value={batchNo}
              onChange={changeBatch}
              filters={itemCode ? { item: itemCode } : undefined}
              placeholder={t("store.inspectionPending.batch")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("store.inspectionPending.serial")}
            </label>
            <LinkField
              doctype="Serial No"
              value={serialNo}
              onChange={changeSerial}
              // Historical rows can refer to serials that have since moved or
              // been delivered, so don't limit this selector to today's
              // warehouse/status. The report API applies the as-of balance.
              filters={itemCode ? { item_code: itemCode } : undefined}
              placeholder={t("store.inspectionPending.serial")}
            />
          </div>
          <div className="space-y-1.5">
            <label
              className="block text-xs font-medium text-muted-foreground"
              htmlFor="inspection-pending-as-of-date"
            >
              {t("store.inspectionPending.asOfDate")}
            </label>
            <Input
              id="inspection-pending-as-of-date"
              type="date"
              value={asOfDate}
              onChange={changeAsOfDate}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("store.inspectionPending.warehouseHint")}
        </p>
      </div>

      {error ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck className="size-5" />
            </EmptyMedia>
            <EmptyTitle>
              {t("store.inspectionPending.loadFailedTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {error.message || t("store.inspectionPending.loadFailedHint")}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={load}>
            {t("common.retry")}
          </Button>
        </Empty>
      ) : !hasWarehouse ? (
        loading ? (
          <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardCheck className="size-5" />
              </EmptyMedia>
              <EmptyTitle>
                {t("store.inspectionPending.noWarehouseTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {t("store.inspectionPending.noWarehouseHint")}
              </EmptyDescription>
            </EmptyHeader>
            {canConfigure ? (
              <Button
                size="sm"
                onClick={() => navigate("/quality/inspection-settings")}
              >
                {t("store.inspectionPending.configure")}
              </Button>
            ) : null}
          </Empty>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <div>
              <span className="font-semibold tabular-nums">{totalItems}</span>{" "}
              <span className="text-muted-foreground">
                {t("store.inspectionPending.linesPending")}
              </span>
            </div>
            <div>
              <span className="font-semibold tabular-nums">
                {meta.mixed_currency
                  ? t("store.inspectionPending.multipleCurrencies")
                  : fmtMoney(meta.stock_value, meta.currency)}
              </span>{" "}
              <span className="text-muted-foreground">
                {t("store.inspectionPending.stockValue")}
              </span>
            </div>
            <div className="min-w-0 truncate text-muted-foreground">
              {meta.warehouse || t("store.inspectionPending.allWarehouses")}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.filters.item")}
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.inspectionPending.batch")}
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.inspectionPending.serial")}
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.inspectionPending.warehouse")}
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.inspectionPending.itemGroup")}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t("store.inspectionPending.quantity")}
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    {t("store.inspectionPending.uom")}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t("store.inspectionPending.stockValue")}
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      {t("store.inspectionPending.empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={`${row.item_code}|${row.batch_no || ""}|${row.serial_no || ""}|${row.warehouse}`}
                      className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40"
                      onClick={() => inspectRow(row)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {row.item_name || row.item_code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.item_code}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.batch_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.serial_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.warehouse || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.item_group || "—"}
                      </td>
                      <td className="px-4 py-3 text-end font-medium tabular-nums">
                        {fmtQty(row.actual_qty)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.stock_uom || "—"}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {fmtMoney(row.stock_value, row.currency || meta.currency)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            inspectRow(row);
                          }}
                        >
                          <ClipboardCheck className="size-3.5" />
                          {t("store.inspectionPending.inspect")}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {canRenderTable && totalItems > 0 ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={totalItems}
              pageSize={limit_page_length}
              onPageSizeChange={setPageSize}
              disabled={loading}
            />
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}
