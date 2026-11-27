import { AttachmentsPanel } from "../Attachments";
import AppModal from "../AppModal";
import { FormField } from "../FormField";
import UomPricingEstimate from "../UomPricingEstimate";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import FieldRenderer from "./FieldRenderer";
import FormSelect from "../FormSelect";
import OperationApprovals from "./OperationApprovals";
import { get } from "../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ChildTable({
  title = "Items",
  columns = [],
  value = [],
  onChange,
  disabled = false,
  pricingSide,
  compactFields,
  bomAttachments = false,
  bomName,
  totalField,
  currency,
  fillHeight = false,
  inlineBomFields = false,
  attachmentDoctype,
  attachmentDocname,
  approvalOperations,
  operationRules,
  onOperationRulesChange,
}) {
  const { t } = useTranslation();
  const [data, setData] = useState(value || []);
  const [editingRow, setEditingRow] = useState(null);
  const [attachmentRow, setAttachmentRow] = useState(null);
  const visibleColumns = Array.isArray(compactFields) ? columns.filter((column) => compactFields.includes(column.field)) : columns;
  const rowActionLabel = t(disabled ? "common.view" : "common.edit");
  const RowActionIcon = disabled ? Eye : Pencil;
  const totalColumnIndex = visibleColumns.findIndex((column) => column.field === totalField);
  const cellValue = (row, field) => inlineBomFields && field === "custom_purchase_amount" && row.qty !== "" && row.custom_purchase_rate !== "" && row.qty != null && row.custom_purchase_rate != null
    ? Math.round((Number(row.qty) * Number(row.custom_purchase_rate) + Number.EPSILON) * 100) / 100
    : row[field];
  const total = totalField ? data.reduce((sum, row) => {
    const value = Number(cellValue(row, totalField));
    return Number.isFinite(value) ? sum + value : sum;
  }, 0) : null;
  const displayValue = (row, column) => {
    const value = cellValue(row, column.field);
    if (column.type === "checkbox") return t(Number(value) === 1 ? "common.yes" : "common.no");
    return value == null || value === "" ? "—" : String(value);
  };

  useEffect(() => {
    // Mirror the controlled `value` prop into local editing state —
    // the component keeps its own copy so cell edits batch cleanly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(value || []);
  }, [value]);

  const update = (newData) => {
    setData(newData);
    onChange && onChange(newData);
  };

  const handleChange = async (rowIndex, field, val) => {
    const updated = [...data];
    updated[rowIndex] = { ...updated[rowIndex] };
    updated[rowIndex][field] = val;
    if (field === "operation_row" && approvalOperations) {
      const operation = approvalOperations.find((item) => item.name === val);
      if (operation) updated[rowIndex].operation = operation.operation;
    }

    // ===== Auto-calculate amount = qty × rate =====
    const colFields = columns.map((c) => c.field);
    if (
      colFields.includes("amount") &&
      (field === "qty" || field === "rate")
    ) {
      const qty = parseFloat(updated[rowIndex].qty) || 0;
      const rate = parseFloat(updated[rowIndex].rate) || 0;
      updated[rowIndex].amount = qty * rate;
    }

    // ===== fetch_from auto-population in child rows =====
    const changedCol = columns.find((c) => c.field === field);
    if (changedCol?.type === "link" && changedCol.options && val) {
      const dependentCols = columns.filter(
        (c) => c.fetchFrom && c.fetchFrom.startsWith(field + ".")
      );
      if (dependentCols.length > 0) {
        try {
          const res = await get(
            `resource/${changedCol.options}/${encodeURIComponent(val)}`
          );
          const linkedData = res.data || {};
          dependentCols.forEach((col) => {
            const sourceKey = col.fetchFrom.split(".").slice(1).join(".");
            if (linkedData[sourceKey] !== undefined) {
              updated[rowIndex][col.field] = linkedData[sourceKey];
            }
          });
        } catch (e) {
          console.warn("Child row fetch_from failed:", e);
        }
      }
    }

    update(updated);
  };

  const addRow = () => {
    if (disabled) return;
    const newRow = {};
    columns.forEach((col) => {
      newRow[col.field] = col.default || "";
    });
    update([...data, newRow]);
    setEditingRow(data.length);
  };

  const deleteRow = (index) => {
    if (disabled) return;
    update(data.filter((_, i) => i !== index));
  };

  const emptyMessage = (
    <div className="py-4 text-center text-sm text-muted-foreground">
      {t("common.noData")}
    </div>
  );
  const headClass = "h-9 px-3 text-start align-middle text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase text-muted-foreground";
  const columnWidth = (column) => column.field === "item_name" ? "min-w-[24rem]" : column.type === "link" && column.options === "Item" ? "min-w-[14rem]" : "";

  return (
    <div className={`min-w-0 bg-card ${fillHeight ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}`}>
      {/* HEADER */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
        <div className="text-sm font-semibold">{title}</div>

        {!disabled && (
          <Button type="button" size="sm" onClick={addRow}>
            <Plus />
            {t("common.addRow")}
          </Button>
        )}
      </div>

      <div className={fillHeight ? "flex min-h-0 flex-1 flex-col" : undefined}>
        <Table className="[&_td]:px-3 [&_td]:py-1" containerClassName={fillHeight ? "min-h-0 flex-1 overflow-auto overscroll-contain" : "max-h-[min(28rem,55dvh)] overflow-auto overscroll-contain"} containerProps={{ tabIndex: 0, role: "region", "aria-label": title }}>
          <TableHeader className="sticky top-0 z-10 bg-table-header shadow-[0_1px_0_rgba(15,23,42,0.06)] [&_tr]:border-border/70">
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${headClass} w-10`}>#</TableHead>

              {visibleColumns.map((col) => (
                <TableHead key={col.field} className={`${headClass} ${columnWidth(col)}`}>{col.label}</TableHead>
              ))}

              {bomAttachments && <TableHead className={headClass}>{t("attachments.open")}</TableHead>}
              <TableHead className={`${headClass} w-20 text-end`}>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2 + (bomAttachments ? 1 : 0)}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="border-border/50 hover:bg-primary/[0.05]">
                  {/* INDEX */}
                  <TableCell className="text-muted-foreground">
                    {rowIndex + 1}
                  </TableCell>

                  {/* FIELDS */}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.field} className={columnWidth(col)}>
                      {inlineBomFields && !disabled && !col.readOnly && col.type === "number" && ["qty", "stock_qty", "rate", "custom_purchase_rate", "hour_rate", "time_in_mins"].includes(col.field) && !(col.field === "rate" && row.is_stock_item != null && Number(row.is_stock_item) === 1) ? (
                        <Input type="number" step="any" className="h-7 w-24 px-2 text-end text-xs tabular-nums" value={row[col.field] ?? ""}
                          aria-label={`${col.label} · ${t("common.row", { n: rowIndex + 1 })}`}
                          onChange={(event) => handleChange(rowIndex, col.field, event.target.value)} />
                      ) : col.type === "attach" && /^\/(?:private\/)?files\//.test(row[col.field] || "") ? (
                        <a className="block max-w-72 truncate text-primary underline" href={row[col.field]} target="_blank" rel="noopener noreferrer">{row[col.field].split("/").pop()}</a>
                      ) : <span className="block max-w-72 truncate" title={displayValue(row, col)}>{displayValue(row, col)}</span>}
                    </TableCell>
                  ))}

                  {bomAttachments && <TableCell><Button type="button" variant="outline" size="sm" onClick={() => { setEditingRow(null); setAttachmentRow(rowIndex); }}>{t("attachments.open")}</Button></TableCell>}
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditingRow(rowIndex)} aria-label={`${rowActionLabel} · ${t("common.row", { n: rowIndex + 1 })}`} title={rowActionLabel}><RowActionIcon /></Button>
                    {!disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteRow(rowIndex)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 />
                      </Button>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {totalField && totalColumnIndex >= 0 && <TableFooter className="sticky bottom-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={totalColumnIndex + 1} className="text-end text-muted-foreground">
                {t(totalField === "custom_purchase_amount" ? "bomForm.totalPurchaseAmount" : "bomForm.totalAmount")}
              </TableCell>
              <TableCell className="font-semibold tabular-nums">
                {currency ? `${currency} ` : ""}{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell colSpan={visibleColumns.length - totalColumnIndex + (bomAttachments ? 1 : 0)} />
            </TableRow>
          </TableFooter>}
        </Table>
      </div>

      {bomAttachments && attachmentRow != null && data[attachmentRow] && <AppModal show onClose={() => setAttachmentRow(null)} width="lg"
        title={`${t("attachments.open")} · ${data[attachmentRow].item_code || attachmentRow + 1}`}>
        <AttachmentsPanel key={`${bomName || "new"}-${data[attachmentRow].name || attachmentRow}`} doctype="BOM"
          docname={bomName && data[attachmentRow].name ? bomName : null} bomItem={data[attachmentRow].name} readOnly={disabled} />
      </AppModal>}
      {editingRow != null && data[editingRow] && <AppModal show onClose={() => setEditingRow(null)} width={onOperationRulesChange ? "xl" : "lg"}
        contentClassName={onOperationRulesChange ? "h-[min(85vh,52rem)]" : undefined}
        bodyClassName={onOperationRulesChange ? "px-0 py-0 md:overflow-hidden" : undefined}
        preventOutsideClose={!!onOperationRulesChange}
        title={`${title} · ${t("common.row", { n: editingRow + 1 })}`}
        footer={<Button variant="outline" onClick={() => setEditingRow(null)}>{t("common.close")}</Button>}>
        <div className={onOperationRulesChange ? "flex min-h-0 flex-col md:h-full md:flex-row" : undefined}>
        <section className={onOperationRulesChange ? "min-w-0 px-5 py-4 md:w-1/2 md:overflow-y-auto md:overscroll-contain" : undefined}>
        {onOperationRulesChange && <h3 className="mb-3 text-sm font-semibold">{t("production.operationDetails")}</h3>}
        <div className={onOperationRulesChange ? "grid gap-4 xl:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
          {columns.map((column) => column.type === "checkbox" ? <div key={column.field} className="flex min-h-8 items-center gap-2 text-sm md:min-h-7">
            <FieldRenderer id={`child-row-${column.field}`} type={column.type} value={data[editingRow][column.field]} options={column.options}
              disabled={disabled || column.readOnly} onChange={(next) => handleChange(editingRow, column.field, next)} />
            <label htmlFor={`child-row-${column.field}`}>{column.label}{column.required && !disabled && <span className="ms-1 text-destructive">*</span>}</label>
          </div> : <FormField key={column.field} label={column.label} required={column.required && !disabled} className={column.type === "link" && column.options === "Item" ? "sm:col-span-2" : undefined}>
            {column.field === "operation_row" && approvalOperations ? <FormSelect value={data[editingRow][column.field] || ""} placeholder={t("production.selectOperation")} options={approvalOperations.filter((operation) => operation.name).map((operation, index) => ({ value: operation.name, label: `${index + 1}. ${operation.operation || "—"}` }))} disabled={disabled} onChange={(next) => handleChange(editingRow, column.field, next)} /> : <FieldRenderer type={column.type} value={data[editingRow][column.field]} options={column.options} filters={column.options === "UI Operation Approval Instruction" ? { enabled: 1, ...(data[editingRow].perspective ? { perspective: data[editingRow].perspective } : {}), ...(data[editingRow].approval_point ? { approval_point: data[editingRow].approval_point } : {}) } : undefined}
              disabled={disabled || column.readOnly} attachmentDoctype={attachmentDoctype} attachmentDocname={attachmentDocname} attachmentField={column.field} onChange={(next) => handleChange(editingRow, column.field, next)} />}
            {pricingSide && column.field === "custom_chargeable_qty" && <UomPricingEstimate row={data[editingRow]} side={pricingSide} readOnly={disabled || !!data[editingRow].docstatus} />}
          </FormField>)}
        </div>
        </section>
        {onOperationRulesChange && <div className="min-w-0 border-t border-border bg-muted/20 px-5 py-4 md:w-1/2 md:overflow-y-auto md:overscroll-contain md:border-s md:border-t-0"><OperationApprovals operation={data[editingRow]} operations={data} rules={operationRules || []} onChange={onOperationRulesChange} disabled={disabled} embedded /></div>}
        </div>
      </AppModal>}
    </div>
  );
}
