import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info, PackagePlus, Undo2 } from "lucide-react";
import { get, post } from "../../../services/api";
import AppModal from "../../../components/AppModal";
import { FormField } from "../../../components/FormField";
import FormSelect from "../../../components/FormSelect";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateISO } from "../../../utils/localDateTime";

/**
 * Return leftover material from a job back into Stores.
 *
 * One action, one Stock Entry (Material Transfer, WIP -> Stores). The brief was
 * a single thing a shopfloor user can finish without learning ERPNext, so the
 * dialog asks only what this item actually needs -- an item with no batch
 * tracking gets one question and nothing else.
 *
 * The two choices the user asked for are the radio pair at the top:
 *   - "Use this item"      -> the leftover goes back under its own code
 *   - "Create a new item"  -> the leftover is a different specification, so it
 *                             gets its own code, group and unit
 *
 * Item creation and the movement are ONE server call, not two. A pair issued
 * separately could half-complete and leave a junk Item in the master with no
 * movement against it. The server also owns the permission checks -- the SPA
 * cannot know what its user's role holds.
 *
 * Batch/serial: the dialog asks for a number only when the item cannot generate
 * one. That rule is ERPNext's, not ours (`serial_batch_bundle.py:190-195`,
 * `:294-308`) -- an item needs BOTH `create_new_batch` and a `batch_number_series`
 * for the number to be generated. `get_return_stock_entry_context` reports
 * which case applies so the field is never shown for an item that cannot use it.
 *
 * Expired batches are not a risk on this path: `validate_serialized_batch` skips
 * the expiry check for Material Transfer (`stock_controller.py:206`, `:225-226`),
 * so leftover material from a job can come back regardless of batch age.
 */

const today = () => localDateISO();

export default function ReturnToStock({ show, onClose, row, defaultCompany, onDone, context }) {
  const { t } = useTranslation();

  const [mode, setMode] = useState("same");
  // Seeded from the row that was clicked rather than written from an effect:
  // this dialog is mounted per open, so the initial value IS the correct state
  // and setting it in an effect is a synchronous setState cascade.
  const [form, setForm] = useState(() => ({
    from_warehouse: "",
    to_warehouse: row?.warehouse || "",
    qty: row?.free_qty ?? "",
    company: defaultCompany || "",
    posting_date: today(),
    remarks: "",
    item_code: row?.item_code || "",
    item_name: "",
    item_group: "",
    stock_uom: row?.stock_uom || "",
    has_batch_no: false,
    has_serial_no: false,
    batch_no: "",
    serials: "",
  }));
  const [ctx, setCtx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  /**
   * Ask the server what this item needs. Only for the "use this item" path --
   * a brand new item has no tracking yet, so its own flags (set in this dialog)
   * are the answer.
   */
  useEffect(() => {
    // `context` is an injection seam: given it, no fetch happens. That is what
    // lets the store suite render this dialog and assert WHICH questions it
    // asks -- which is the entire behaviour of this feature. Under SSR a
    // component that fetches on mount can only ever render its initial state,
    // so without this the batch/serial rules would be untestable.
    if (!show || mode !== "same" || !form.item_code || context) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await get(
          "method/erpnext_ui.api.get_return_stock_entry_context",
          { item_code: form.item_code },
        );
        if (!cancelled) setCtx(res.message || null);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, mode, form.item_code, context]);

  const serials = useMemo(
    () =>
      form.serials
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [form.serials],
  );

  const effective = useMemo(() => {
    if (mode === "same") return context || ctx;
    // A new item's tracking is whatever the user just ticked.
    return {
      has_batch_no: form.has_batch_no,
      has_serial_no: form.has_serial_no,
      // A new item never has a series, so a batch/serial number is required.
      auto_batch: false,
      auto_serial: false,
      needs_batch_number: form.has_batch_no,
      needs_serials: form.has_serial_no,
    };
  }, [mode, context, ctx, form.has_batch_no, form.has_serial_no]);

  const submit = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        company: form.company,
        from_warehouse: form.from_warehouse,
        to_warehouse: form.to_warehouse,
        qty: form.qty,
        posting_date: form.posting_date,
        remarks: form.remarks,
        submit_now: 1,
      };

      if (mode === "same") {
        payload.item_code = form.item_code;
        if (effective?.needs_batch_number) payload.batch_no = form.batch_no;
        if (effective?.needs_serials) payload.serial_nos = JSON.stringify(serials);
      } else {
        payload.new_item = JSON.stringify({
          item_code: form.item_code,
          item_name: form.item_name,
          item_group: form.item_group,
          stock_uom: form.stock_uom,
          has_batch_no: form.has_batch_no,
          has_serial_no: form.has_serial_no,
        });
        if (effective?.needs_batch_number) payload.batch_no = form.batch_no;
        if (effective?.needs_serials) payload.serial_nos = JSON.stringify(serials);
      }

      const res = await post("method/erpnext_ui.api.create_return_stock_entry", payload);
      const result = res.message || {};
      onClose?.();
      // Deliberately NOT navigating to the Stock Entry: `/store/stock-entry`
      // is the create screen and has no load path, so `?name=` would open a
      // blank form and look like the movement had vanished. The page refreshes
      // instead -- the balance visibly changes -- and offers a desk link to the
      // real entry.
      onDone?.(result);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [form, mode, effective, serials, onClose, onDone]);

  if (!row) return null;

  const canSave =
    form.from_warehouse &&
    form.to_warehouse &&
    form.from_warehouse !== form.to_warehouse &&
    form.company &&
    Number(form.qty) > 0 &&
    (mode === "same" ? form.item_code : form.item_code && form.item_group && form.stock_uom) &&
    !(effective?.needs_batch_number && !form.batch_no) &&
    !(effective?.needs_serials && serials.length === 0);

  return (
    <AppModal
      show={show}
      onClose={onClose}
      width="md"
      title={t("store.returnStock.title")}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSave || saving}>
            <Undo2 className="size-4" />
            {saving ? t("common.saving") : t("store.returnStock.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="flex items-start gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("store.returnStock.explainer")}
        </p>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        {/* WHICH ITEM */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("store.returnStock.whichItem")}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "same", icon: Undo2 },
              { key: "new", icon: PackagePlus },
            ].map((opt) => {
              const Icon = opt.icon;
              const selected = mode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setMode(opt.key);
                    // Switching to a different specification means a different
                    // identity, so clear the borrowed code rather than let it
                    // overwrite the original item.
                    if (opt.key === "new" && form.item_code === row.item_code) {
                      patch({ item_code: "", item_name: "", batch_no: "", serials: "" });
                    }
                  }}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="block font-medium">
                      {opt.key === "same"
                        ? t("store.returnStock.useSameItem")
                        : t("store.returnStock.createNewItem")}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {opt.key === "same"
                        ? t("store.returnStock.useSameItemHint")
                        : t("store.returnStock.createNewItemHint")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <FormField
          label={t("store.form.item")}
          required
          hint={mode === "same" ? row.item_code : null}
        >
          {mode === "same" ? (
            <Input value={row.item_code} disabled />
          ) : (
            <LinkField doctype="Item" value={form.item_code} onChange={(v) => patch({ item_code: v || "" })} />
          )}
        </FormField>

        {mode === "new" ? (
          <>
            <FormField label={t("store.returnStock.itemName")} required>
              <Input value={form.item_name} onChange={(e) => patch({ item_name: e.target.value })} />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("store.returnStock.itemGroup")} required>
                <LinkField doctype="Item Group" value={form.item_group} onChange={(v) => patch({ item_group: v || "" })} />
              </FormField>
              <FormField label={t("store.form.uom")} required>
                <LinkField doctype="UOM" value={form.stock_uom} onChange={(v) => patch({ stock_uom: v || "" })} />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.has_batch_no}
                  onChange={(e) => patch({ has_batch_no: e.target.checked, batch_no: "" })}
                />
                {t("store.returnStock.trackBatch")}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.has_serial_no}
                  onChange={(e) => patch({ has_serial_no: e.target.checked, serials: "" })}
                />
                {t("store.returnStock.trackSerial")}
              </label>
            </div>
          </>
        ) : null}

        {/* MOVEMENT */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("store.returnStock.fromWarehouse")} required>
            <LinkField doctype="Warehouse" value={form.from_warehouse} onChange={(v) => patch({ from_warehouse: v || "" })} />
          </FormField>
          <FormField label={t("store.returnStock.toWarehouse")} required>
            <LinkField doctype="Warehouse" value={form.to_warehouse} onChange={(v) => patch({ to_warehouse: v || "" })} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label={t("store.returnStock.qty", { uom: form.stock_uom || "" })}
            required
          >
            <Input
              type="number"
              step="any"
              value={form.qty}
              onChange={(e) => patch({ qty: e.target.value })}
            />
          </FormField>
          <FormField label={t("store.receipt.postingDate")} required>
            <Input
              type="date"
              max={today()}
              value={form.posting_date}
              onChange={(e) => patch({ posting_date: e.target.value })}
            />
          </FormField>
        </div>

        {/* BATCH / SERIAL -- only when this item cannot generate its own */}
        {effective?.needs_batch_number ? (
          <FormField label={t("store.returnStock.batchNumber")} required>
            <Input value={form.batch_no} onChange={(e) => patch({ batch_no: e.target.value })} />
          </FormField>
        ) : null}

        {effective?.needs_serials ? (
          <FormField
            label={t("store.returnStock.serialNumbers")}
            hint={t("store.returnStock.serialNumbersHint")}
            required
          >
            <Input
              value={form.serials}
              placeholder={t("store.returnStock.serialPlaceholder")}
              onChange={(e) => patch({ serials: e.target.value })}
            />
          </FormField>
        ) : null}

        {/* `effective`, not `ctx`: these notes must reflect the merged view, or
            they vanish whenever `context` is injected instead of fetched. */}
        {effective?.auto_batch ? (
          <p className="text-xs text-muted-foreground">
            {t("store.returnStock.autoBatch")}
          </p>
        ) : null}

        {effective?.auto_serial ? (
          <p className="text-xs text-muted-foreground">
            {t("store.returnStock.autoSerial")}
          </p>
        ) : null}

        <FormField label={t("store.returnStock.remarks")}>
          <Input value={form.remarks} onChange={(e) => patch({ remarks: e.target.value })} />
        </FormField>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ArrowRight className="size-3" />
          {t("store.returnStock.makesEntry", {
            from: form.from_warehouse || "…",
            to: form.to_warehouse || "…",
          })}
        </p>
      </div>
    </AppModal>
  );
}