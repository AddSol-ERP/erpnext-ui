import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/money";

/**
 * Payment schedule as a table: term, due date, portion and amount, with a
 * footer totalling the schedule.
 *
 * The previous version printed a bare due date and amount, which hid the
 * structure of the deal (30% advance / 70% on delivery) that an approver is
 * being asked to accept. `invoice_portion` and `payment_term` are both on the
 * Payment Schedule row, so nothing here is derived.
 *
 * When the document has no schedule the card still renders, with an explicit
 * sentence. Hiding the section made "no payment terms agreed" indistinguishable
 * from "terms exist but this screen forgot to show them".
 */
export default function PaymentTerms({ schedule = [], template, currency }) {
  const { t } = useTranslation();
  const rows = Array.isArray(schedule) ? schedule : [];

  const totals = rows.reduce(
    (acc, row) => ({
      portion: acc.portion + (Number(row.invoice_portion) || 0),
      amount: acc.amount + (Number(row.payment_amount) || 0),
    }),
    { portion: 0, amount: 0 },
  );

  return (
    <section className="flex h-full flex-col rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t("approvals.preview.paymentTerms")}
        </h3>

        {template && (
          <span className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {t("approvals.preview.termsTemplate")}: {template}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {template
            ? t("approvals.preview.noPaymentSchedule")
            : t("approvals.preview.noPaymentTerms")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pe-2 text-start font-medium">
                  {t("approvals.preview.term")}
                </th>
                <th className="py-1 pe-2 text-start font-medium">
                  {t("approvals.preview.dueDate")}
                </th>
                <th className="py-1 pe-2 text-end font-medium">
                  {t("approvals.preview.portion")}
                </th>
                <th className="py-1 text-end font-medium">
                  {t("approvals.preview.amount")}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const portion = Number(row.invoice_portion) || 0;
                const discount = Number(row.discount) || 0;

                return (
                  <tr
                    key={row.name || index}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-1.5 pe-2">
                      <div className="font-medium">
                        {row.payment_term ||
                          t("approvals.preview.term")}
                      </div>
                      {row.description && (
                        <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
                          {row.description}
                        </div>
                      )}
                      {discount !== 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {t("approvals.preview.discount")}:{" "}
                          {formatMoney(discount, currency)}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pe-2">
                      {row.due_date || "-"}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pe-2 text-end tabular-nums">
                      {portion ? `${portion}%` : "-"}
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-end tabular-nums">
                      {formatMoney(row.payment_amount, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5 pe-2" colSpan={2}>
                  {t("approvals.preview.total")}
                </td>
                <td className="whitespace-nowrap py-1.5 pe-2 text-end tabular-nums">
                  {totals.portion ? `${totals.portion}%` : "-"}
                </td>
                <td className="whitespace-nowrap py-1.5 text-end tabular-nums">
                  {formatMoney(totals.amount, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
