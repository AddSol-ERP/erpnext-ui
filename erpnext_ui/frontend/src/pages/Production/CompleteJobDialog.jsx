import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "../../components/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The one question ERPNext itself asks before a job is completed: how much was
 * actually made. Desk prompts the same way (`job_card.js`, "Complete Job"),
 * defaulting to the outstanding quantity -- completing the whole lot is the
 * common case, but booking it silently would record stock nobody made, with no
 * error anywhere.
 *
 * A dialog on purpose, and never stacked on another: on the dashboard it is
 * the page's only overlay, and in the job-card preview it REPLACES that
 * modal's action footer (the preview swaps into this editor rather than opening
 * on top of itself). See MEMORY §9.8e for what stacking a dialog on a dialog
 * cost in the Purchase Receipt.
 */
export default function CompleteJobDialog({
  target,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState("");

  // Re-seed the field every time a card is targeted: an operator completing
  // two cards in a row must not be offered the previous card's quantity.
  useEffect(() => {
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQty(String(target.outstanding ?? ""));
    }
  }, [target]);

  const parsed = qty.trim() === "" ? NaN : Number(qty);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  return (
    <AppModal
      show={Boolean(target)}
      onClose={onCancel}
      title={t("production.completeJobTitle")}
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1 bg-emerald-600 text-white hover:bg-emerald-600/85"
            disabled={busy || !valid}
            onClick={() => onConfirm(parsed)}
          >
            {busy ? t("production.processing") : t("production.completeConfirm")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted-foreground">
          {t("production.completeJobFor", { name: target?.name || "" })}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="complete-job-qty"
          >
            {t("production.completedQty")}
          </label>
          <Input
            id="complete-job-qty"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <div className="text-xs text-muted-foreground">
          {t("production.outstandingQty", { qty: target?.outstanding ?? 0 })}
        </div>

        {!valid && (
          <div className="text-xs text-destructive">
            {t("production.invalidQty")}
          </div>
        )}
      </div>
    </AppModal>
  );
}
