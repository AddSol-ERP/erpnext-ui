import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/money";
import { cn } from "cn";

function Row({ label, value, currency, strong, muted, hint }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-1",
        strong && "border-t border-border pt-2 text-base font-bold",
      )}
    >
      <span className={cn("min-w-0", muted && "text-muted-foreground")}>
        <span className={cn("break-words", !strong && "text-sm")}>{label}</span>
        {hint && (
          <span className="ms-1 text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>

      <span
        className={cn(
          "shrink-0 whitespace-nowrap tabular-nums",
          muted && "text-muted-foreground",
          !strong && "text-sm",
        )}
      >
        {formatMoney(value, currency)}
      </span>
    </div>
  );
}

/**
 * The money story of the document, in ERPNext's own order:
 * net total -> additional discount -> each tax row -> rounding -> total.
 *
 * This is what a quotation is actually approved on, so it is its own card
 * rather than a footnote under the addresses. Every figure comes from a column
 * ERPNext already calculated -- nothing is re-derived here, because a screen
 * that recomputes totals eventually disagrees with the document it is showing.
 *
 * The final row prefers `rounded_total` when ERPNext rounded the payable
 * amount, and keeps the unrounded `grand_total` visible above it so the
 * difference is explainable rather than a missing rupee.
 */
export default function FinancialSummary({ doc, currency }) {
  const { t } = useTranslation();

  const taxes = Array.isArray(doc.taxes) ? doc.taxes : [];
  const discount = Number(doc.discount_amount) || 0;
  const discountPercent = Number(doc.additional_discount_percentage) || 0;
  const rounding = Number(doc.rounding_adjustment) || 0;
  const grandTotal = Number(doc.grand_total) || 0;
  const roundedTotal = Number(doc.rounded_total) || 0;
  const hasRoundedTotal =
    !doc.disable_rounded_total &&
    roundedTotal > 0 &&
    Math.abs(roundedTotal - grandTotal) >= 0.005;

  return (
    <section className="flex h-full flex-col rounded-xl border border-border p-3">
      <h3 className="mb-2 text-sm font-semibold">
        {t("approvals.preview.financialSummary")}
      </h3>

      <div className="flex flex-1 flex-col">
        <Row
          label={t("approvals.preview.netTotal")}
          value={doc.net_total}
          currency={currency}
        />

        {discount > 0 && (
          <Row
            label={t("approvals.preview.additionalDiscount")}
            hint={discountPercent > 0 ? `(${discountPercent}%)` : null}
            value={-discount}
            currency={currency}
          />
        )}

        {taxes.length > 0 && (
          <div className="mt-1 border-t border-border/70 pt-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("approvals.preview.taxesAndCharges")}
            </div>

            {taxes.map((tax, index) => {
              const rate = Number(tax.rate) || 0;

              return (
                <Row
                  key={tax.name || index}
                  label={tax.description || t("approvals.preview.taxesAndCharges")}
                  hint={rate ? `(${rate}%)` : null}
                  value={tax.tax_amount}
                  currency={currency}
                  muted
                />
              );
            })}
          </div>
        )}

        {rounding !== 0 && (
          <Row
            label={t("approvals.preview.roundingAdjustment")}
            value={rounding}
            currency={currency}
            muted
          />
        )}

        {hasRoundedTotal && (
          <Row
            label={t("approvals.preview.grandTotal")}
            value={grandTotal}
            currency={currency}
            muted
          />
        )}

        <div className="mt-auto">
          <Row
            label={
              hasRoundedTotal
                ? t("approvals.preview.roundedTotal")
                : t("approvals.preview.grandTotal")
            }
            value={hasRoundedTotal ? roundedTotal : grandTotal}
            currency={currency}
            strong
          />
        </div>
      </div>
    </section>
  );
}
