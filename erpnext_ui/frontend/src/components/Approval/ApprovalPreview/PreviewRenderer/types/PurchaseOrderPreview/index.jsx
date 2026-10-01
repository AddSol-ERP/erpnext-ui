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

            {/* PAYMENT */}
            {doc.payment_schedule?.length > 0 && (
              <div>
                <div className="mb-1 text-sm font-semibold">
                  {t("approvals.preview.payment")}
                </div>

                {doc.payment_schedule.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{p.due_date}</span>
                    <span>
                      {symbol}
                      {p.payment_amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </BasePreview>
  );
}
