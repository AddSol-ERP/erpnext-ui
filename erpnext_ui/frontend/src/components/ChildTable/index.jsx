import { AttachmentsPanel } from "../Attachments";
import AppModal from "../AppModal";
import { FormField } from "../FormField";
import UomPricingEstimate from "../UomPricingEstimate";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import FieldRenderer from "./FieldRenderer";
import { get } from "../../services/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
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
}) {
  const { t } = useTranslation();
  const [data, setData] = useState(value || []);
  const [editingRow, setEditingRow] = useState(null);
  const [attachmentRow, setAttachmentRow] = useState(null);
  const visibleColumns = Array.isArray(compactFields) ? columns.filter((column) => compactFields.includes(column.field)) : columns;
  const rowActionLabel = t(disabled ? "common.view" : "common.edit");
  const RowActionIcon = disabled ? Eye : Pencil;
  const displayValue = (row, column) => {
    const value = row[column.field];
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
    updated[rowIndex][field] = val;

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

  return (
    <div className="rounded-none bg-card ring-1 ring-foreground/10">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="text-sm font-semibold">{title}</div>

        {!disabled && (
          <Button size="sm" onClick={addRow}>
            <Plus />
            {t("common.addRow")}
          </Button>
        )}
      </div>

      {/* =========================
          DESKTOP TABLE
      ========================= */}
      <div className="hidden md:block">
        <Table className="[&_th]:h-8 [&_th]:px-2 [&_td]:px-1.5 [&_td]:py-1 [&_input:not([type=checkbox])]:h-8" containerClassName="overflow-x-auto" containerProps={{ tabIndex: 0, role: "region", "aria-label": title }}>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-10">#</TableHead>

              {visibleColumns.map((col) => (
                <TableHead key={col.field} className={col.type === "link" && col.options === "Item" ? "min-w-[16rem]" : undefined}>{col.label}</TableHead>
              ))}

              <TableHead className="w-12"><span className="sr-only">{rowActionLabel}</span></TableHead>
              {bomAttachments && <TableHead>{t("attachments.open")}</TableHead>}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 3 + (bomAttachments ? 1 : 0)}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {/* INDEX */}
                  <TableCell className="text-muted-foreground">
                    {rowIndex + 1}
                  </TableCell>

                  {/* FIELDS */}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.field} className={col.type === "link" && col.options === "Item" ? "min-w-[16rem]" : undefined}>
                      <span className="block max-w-72 truncate" title={displayValue(row, col)}>{displayValue(row, col)}</span>
                    </TableCell>
                  ))}

                  <TableCell><Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditingRow(rowIndex)} aria-label={`${rowActionLabel} · ${t("common.row", { n: rowIndex + 1 })}`} title={rowActionLabel}><RowActionIcon /></Button></TableCell>
                  {bomAttachments && <TableCell><Button type="button" variant="outline" size="sm" onClick={() => { setEditingRow(null); setAttachmentRow(rowIndex); }}>{t("attachments.open")}</Button></TableCell>}
                  {/* DELETE */}
                  <TableCell>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteRow(rowIndex)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* =========================
          MOBILE CARD VIEW
      ========================= */}
      <div className="flex flex-col gap-2 p-2 md:hidden" role="region" aria-label={title}>
        {data.length === 0 ? (
          emptyMessage
        ) : (
          data.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="rounded-lg border border-border bg-background p-2"
            >
              {/* HEADER */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("common.row", { n: rowIndex + 1 })}
                </span>

                {!disabled && (
                  <Button
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

              <Button type="button" variant="ghost" size="icon-sm" className="mb-2" onClick={() => setEditingRow(rowIndex)} aria-label={`${rowActionLabel} · ${t("common.row", { n: rowIndex + 1 })}`} title={rowActionLabel}><RowActionIcon /></Button>
              {bomAttachments && <Button type="button" variant="outline" size="sm" className="mb-2" onClick={() => { setEditingRow(null); setAttachmentRow(rowIndex); }}>{t("attachments.open")}</Button>}
              {/* FIELDS */}
              <div className="flex flex-col gap-2">
                {visibleColumns.map((col) => (
                  <div key={col.field}>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {col.label}
                    </div>

                    <div className="break-words text-sm">{displayValue(row, col)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {bomAttachments && attachmentRow != null && data[attachmentRow] && <AppModal show onClose={() => setAttachmentRow(null)} width="lg"
        title={`${t("attachments.open")} · ${data[attachmentRow].item_code || attachmentRow + 1}`}>
        <AttachmentsPanel key={`${bomName || "new"}-${data[attachmentRow].name || attachmentRow}`} doctype="BOM"
          docname={bomName && data[attachmentRow].name ? bomName : null} bomItem={data[attachmentRow].name} readOnly={disabled} />
      </AppModal>}
      {editingRow != null && data[editingRow] && <AppModal show onClose={() => setEditingRow(null)} width="lg"
        title={`${title} · ${t("common.row", { n: editingRow + 1 })}`}
        footer={<Button variant="outline" onClick={() => setEditingRow(null)}>{t("common.close")}</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {columns.map((column) => column.type === "checkbox" ? <div key={column.field} className="flex min-h-8 items-center gap-2 text-sm md:min-h-7">
            <FieldRenderer id={`child-row-${column.field}`} type={column.type} value={data[editingRow][column.field]} options={column.options}
              disabled={disabled || column.readOnly} onChange={(next) => handleChange(editingRow, column.field, next)} />
            <label htmlFor={`child-row-${column.field}`}>{column.label}{column.required && !disabled && <span className="ms-1 text-destructive">*</span>}</label>
          </div> : <FormField key={column.field} label={column.label} required={column.required && !disabled} className={column.type === "link" && column.options === "Item" ? "sm:col-span-2" : undefined}>
            <FieldRenderer type={column.type} value={data[editingRow][column.field]} options={column.options}
              disabled={disabled || column.readOnly} onChange={(next) => handleChange(editingRow, column.field, next)} />
            {pricingSide && column.field === "custom_chargeable_qty" && <UomPricingEstimate row={data[editingRow]} side={pricingSide} readOnly={disabled || !!data[editingRow].docstatus} />}
          </FormField>)}
        </div>
      </AppModal>}
    </div>
  );
}
