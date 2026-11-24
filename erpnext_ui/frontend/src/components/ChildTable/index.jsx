import { AttachmentsPanel } from "../Attachments";
import AppModal from "../AppModal";
import { FormField } from "../FormField";
import UomPricingEstimate from "../UomPricingEstimate";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
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
  fillHeight = false,
}) {
  const { t } = useTranslation();
  const [data, setData] = useState(value || []);
  const [editingRow, setEditingRow] = useState(null);
  const [attachmentRow, setAttachmentRow] = useState(null);
  const compact = Array.isArray(compactFields);
  const visibleColumns = compact ? columns.filter((column) => compactFields.includes(column.field)) : columns;

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

  // Column heads match DataTable exactly (h-9, 11px uppercase muted): the
  // child grid and the list grid are the same visual object, so their headers
  // must read the same. `w-10` is kept on the index head for column alignment.
  const headCls =
    "h-9 px-3 text-start align-middle text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase text-muted-foreground";

  // The Item code and Item name columns split the row's width between them.
  // A cell's width floor has to come from a class here: the inputs are
  // `w-full min-w-0`, so a text column with no floor collapses to its header
  // and a reader sees a 24rem code beside a 6rem name. The code is a short
  // stable identifier — it keeps a smaller floor, and the name, which is what
  // the row is recognised by, gets the wide one.
  const colWidthClass = (col) => {
    if (col.field === "item_name") return "min-w-[24rem]";
    if (col.type === "link" && col.options === "Item") return "min-w-[14rem]";
    return undefined;
  };

  return (
    // Full-bleed surface, matching ListLayout: no ring, no shadow. The parent
    // (FormSection, or the BOM Tabs card) already draws the boundary, so a ring
    // here was a card inside a card — the same chrome ListLayout dropped. The
    // bands are separated by hairlines instead.
    <div className={`bg-card ${fillHeight ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}`}>
      {/* HEADER — same band rhythm as ActionBar (px-3 py-2 sm:px-4). shrink-0:
          in fillHeight the outer div is a flex column, and a header that could
          shrink would push the grid's scroll area past its bounds. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2 sm:px-4">
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
      <div className={fillHeight ? "hidden md:flex md:min-h-0 md:flex-1 md:flex-col" : "hidden md:block"}>
        <Table
          containerClassName={fillHeight ? "min-h-0 flex-1 overflow-auto overscroll-contain" : "max-h-[min(28rem,60vh)] overflow-auto overscroll-contain"}
          containerProps={{ tabIndex: 0, role: "region", "aria-label": title }}
        >
          {/* Same header band as DataTable: tinted, hairline underneath, so a
              scrolling body passes beneath an opaque strip rather than showing
              through a translucent one. */}
          <TableHeader className="sticky top-0 z-10 bg-table-header shadow-[0_1px_0_rgba(15,23,42,0.06)] [&_tr]:border-border/70">
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(headCls, "w-10")}>#</TableHead>

              {visibleColumns.map((col) => (
                <TableHead key={col.field} className={cn(headCls, colWidthClass(col))}>{col.label}</TableHead>
              ))}

              {compact && <TableHead className={cn(headCls, "w-20")} />}
              {bomAttachments && <TableHead className={headCls}>{t("attachments.open")}</TableHead>}
              <TableHead className={cn(headCls, "w-12")} />
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (compact ? 3 : 2) + (bomAttachments ? 1 : 0)}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, rowIndex) => (
                // Same row language as DataTable: hairline separators at 50%
                // and the primary hover tint. The tint is not decorative —
                // clicking anywhere in a child row lands in one of its inputs,
                // so the row behaves as clickable and must read as one.
                <TableRow
                  key={rowIndex}
                  className="border-border/50 hover:bg-primary/[0.05]"
                >
                  {/* INDEX */}
                  <TableCell className="px-3 py-1 align-middle text-muted-foreground">
                    {rowIndex + 1}
                  </TableCell>

                  {/* FIELDS */}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.field} className={cn("px-3 py-1 align-middle", colWidthClass(col))}>
                      <FieldRenderer
                        cell
                        type={col.type}
                        value={row[col.field]}
                        options={col.options}
                        onChange={(val) =>
                          handleChange(rowIndex, col.field, val)
                        }
                        disabled={disabled || col.readOnly}
                      />
                      {pricingSide && col.field === "custom_chargeable_qty" && <UomPricingEstimate row={row} side={pricingSide} readOnly={disabled || !!row.docstatus} />}
                    </TableCell>
                  ))}

                  {compact && <TableCell className="px-3 py-1 align-middle"><Button variant="outline" size="sm" onClick={() => setEditingRow(rowIndex)}>{t(disabled ? "common.view" : "common.edit")}</Button></TableCell>}
                  {bomAttachments && <TableCell className="px-3 py-1 align-middle"><Button type="button" variant="outline" size="sm" onClick={() => { setEditingRow(null); setAttachmentRow(rowIndex); }}>{t("attachments.open")}</Button></TableCell>}
                  {/* DELETE */}
                  <TableCell className="px-3 py-1 align-middle">
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
      <div className={`flex flex-col gap-2 overflow-y-auto overscroll-contain p-3 md:hidden ${fillHeight ? "min-h-0 flex-1" : "max-h-[min(28rem,60vh)]"}`} role="region" aria-label={title} tabIndex={0}>
        {data.length === 0 ? (
          emptyMessage
        ) : (
          data.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="rounded-none border border-border/60 bg-background p-3"
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

              {compact && <Button variant="outline" size="sm" className="mb-3" onClick={() => setEditingRow(rowIndex)}>{t(disabled ? "common.view" : "common.edit")}</Button>}
              {bomAttachments && <Button type="button" variant="outline" size="sm" className="mb-3" onClick={() => { setEditingRow(null); setAttachmentRow(rowIndex); }}>{t("attachments.open")}</Button>}
              {/* FIELDS */}
              <div className="flex flex-col gap-2">
                {visibleColumns.map((col) => (
                  <div key={col.field}>
                    <div className="mb-1 text-xs text-muted-foreground">
                      {col.label}
                    </div>

                    <FieldRenderer
                      type={col.type}
                      value={row[col.field]}
                      options={col.options}
                      onChange={(val) =>
                        handleChange(rowIndex, col.field, val)
                      }
                      disabled={disabled || col.readOnly}
                    />
                    {pricingSide && col.field === "custom_chargeable_qty" && <UomPricingEstimate row={row} side={pricingSide} readOnly={disabled || !!row.docstatus} />}
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
      {compact && editingRow != null && data[editingRow] && <AppModal show onClose={() => setEditingRow(null)} width="lg"
        title={`${title} · ${t("common.row", { n: editingRow + 1 })}`}
        footer={<Button variant="outline" onClick={() => setEditingRow(null)}>{t("common.close")}</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {columns.map((column) => <FormField key={column.field} label={column.label} required={column.required && !disabled} className={column.type === "link" && column.options === "Item" ? "sm:col-span-2" : undefined}>
            <FieldRenderer type={column.type} value={data[editingRow][column.field]} options={column.options}
              disabled={disabled || column.readOnly} onChange={(next) => handleChange(editingRow, column.field, next)} />
          </FormField>)}
        </div>
      </AppModal>}
    </div>
  );
}
