import { useTranslation } from "react-i18next";
import { BasePreview } from "..";
import { Badge } from "@/components/ui/badge";

const getCurrencySymbol = (currency) => {
  const map = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
  };

  return map[currency] || currency || "";
};

export default function PurchaseOrderPreview({ doc }) {
  const { t } = useTranslation();
  const symbol = getCurrencySymbol(doc.currency);

  return (
    <BasePreview>
      {/* ================= HEADER ================= */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{doc.name}</div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.supplier}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.contact_mobile} · {doc.contact_email}
          </div>
        </div>

        <div className="shrink-0 text-end">
          <div className="text-sm text-muted-foreground">
            {doc.transaction_date}
          </div>

          <Badge className="mt-1 bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {doc.workflow_state || doc.status}
          </Badge>

          <div className="mt-1 font-bold">
            {symbol}
            {doc.rounded_total || doc.grand_total}
          </div>
        </div>
      </div>

      {/* ============ TERMS & PAYMENT TERMS ============
          Surfaced immediately below the header, before the line items, so the
          approver can read the commercial terms first and act without hunting
          for them. `doc` here is the full document fetched by PreviewRenderer,
          so `terms` (Text Editor HTML) and `payment_schedule` are both present
          -- the list row does not carry them. */}
      {(doc.terms || doc.payment_schedule?.length > 0) && (
        <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-5">
          {/* TERMS AND CONDITIONS */}
          {doc.terms && (
            <div className="rounded-lg border border-border p-3 xl:col-span-3">
              <div className="mb-1.5 text-sm font-semibold">
                {t("approvals.termsAndConditions")}
              </div>

              <div
                className="max-h-44 overflow-y-auto break-words text-sm leading-relaxed text-muted-foreground [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: doc.terms }}
              />
            </div>
          )}

          {/* PAYMENT TERMS */}
          {doc.payment_schedule?.length > 0 && (
            <div
              className={`rounded-lg border border-border p-3 ${doc.terms ? "xl:col-span-2" : "xl:col-span-5"}`}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {t("approvals.preview.paymentTerms")}
                </span>

                {doc.payment_terms_template && (
                  <span className="text-xs text-muted-foreground">
                    {t("approvals.preview.termsTemplate")}:{" "}
                    {doc.payment_terms_template}
                  </span>
                )}
              </div>

              <div className="max-h-44 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs uppercase text-muted-foreground">
                      <th className="py-1 pe-2 text-start font-medium">
                        {t("approvals.preview.term")}
                      </th>
                      <th className="py-1 pe-2 text-start font-medium">
                        {t("approvals.preview.dueDate")}
                      </th>
                      <th className="py-1 pe-2 text-start font-medium">
                        {t("approvals.preview.portion")}
                      </th>
                      <th className="py-1 pe-2 text-end font-medium">
                        {t("approvals.preview.amount")}
                      </th>
                      <th className="py-1 text-end font-medium">
                        {t("approvals.preview.discount")}
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {doc.payment_schedule.map((p) => (
                      <tr
                        key={p.name}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-1 pe-2">
                          <div className="font-medium">{p.payment_term}</div>
                          {p.description && (
                            <div className="text-xs text-muted-foreground">
                              {p.description}
                            </div>
                          )}
                        </td>
                        <td className="py-1 pe-2 whitespace-nowrap">
                          {p.due_date || "-"}
                        </td>
                        <td className="py-1 pe-2 whitespace-nowrap">
                          {p.invoice_portion ? `${p.invoice_portion}%` : "-"}
                        </td>
                        <td className="py-1 pe-2 text-end whitespace-nowrap">
                          {symbol}
                          {p.payment_amount}
                        </td>
                        <td className="py-1 text-end whitespace-nowrap">
                          {p.discount || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        {/* LEFT */}
        <div className="md:col-span-7 2xl:col-span-8">
          <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
            <div className="mb-2 font-semibold">
              {t("approvals.preview.items")}
            </div>

            <div className="flex flex-col gap-2">
              {doc.items?.map((i) => (
                <div key={i.name} className="rounded-lg border border-border p-2">
                  <div className="font-semibold">{i.item_code}</div>

                  <div
                    className="mb-1 break-words text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: i.description }}
                  />

                  <div className="text-sm text-muted-foreground">
                    {t("approvals.preview.project", {
                      value: i.project || "-",
                    })}
                  </div>

                  <div className="mt-1 flex items-start justify-between gap-2 text-sm">
                    <span>
                      {t("approvals.preview.qty", {
                        qty: i.qty,
                        uom: i.uom || "",
                      })}
                    </span>

                    <span>
                      {symbol}
                      {i.rate} / {i.uom || ""}
                    </span>

                    <span className="font-semibold">
                      {symbol}
                      {i.amount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="md:col-span-5 2xl:col-span-4">
          <div className="flex flex-col gap-3">
            {/* ADDRESS */}
            <div>
              <div className="text-sm font-semibold">
                {t("approvals.preview.supplier")}
              </div>
              <div
                className="break-words text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: doc.address_display || "-",
                }}
              />
            </div>

            <div>
              <div className="text-sm font-semibold">
                {t("approvals.preview.shipping")}
              </div>
              <div
                className="break-words text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: doc.shipping_address_display || "-",
                }}
              />
            </div>

            {/* TOTALS */}
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-sm">
                <span>{t("approvals.preview.subTotal")}</span>
                <span>
                  {symbol}
                  {doc.net_total}
                </span>
              </div>

              {doc.taxes?.map((tax) => (
                <div
                  key={tax.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {tax.description} ({tax.rate}%)
                  </span>
                  <span>
                    {symbol}
                    {tax.tax_amount}
                  </span>
                </div>
              ))}

              <div className="mt-2 flex items-center justify-between font-bold">
                <span>{t("approvals.preview.total")}</span>
                <span>
                  {symbol}
                  {doc.rounded_total || doc.grand_total}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BasePreview>
  );
}
