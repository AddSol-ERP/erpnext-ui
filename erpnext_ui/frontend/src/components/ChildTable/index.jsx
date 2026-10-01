import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
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
}) {
  const { t } = useTranslation();
  const [data, setData] = useState(value || []);

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
    <div className="py-6 text-center text-sm text-muted-foreground">
      {t("common.noData")}
    </div>
  );

  return (
    <div className="rounded-none bg-card ring-1 ring-foreground/10">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>

              {columns.map((col) => (
                <TableHead key={col.field}>{col.label}</TableHead>
              ))}

              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 2}>
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
                  {columns.map((col) => (
                    <TableCell key={col.field}>
                      <FieldRenderer
                        type={col.type}
                        value={row[col.field]}
                        options={col.options}
                        onChange={(val) =>
                          handleChange(rowIndex, col.field, val)
                        }
                        disabled={disabled}
                      />
                    </TableCell>
                  ))}

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
      <div className="flex flex-col gap-3 p-3 md:hidden">
        {data.length === 0 ? (
          emptyMessage
        ) : (
          data.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="rounded-lg border border-border bg-background p-3"
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

              {/* FIELDS */}
              <div className="flex flex-col gap-2">
                {columns.map((col) => (
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
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
