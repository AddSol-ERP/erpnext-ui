import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
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

export default function ExpensePreview({ doc }) {
  const { t } = useTranslation();
  const symbol = getCurrencySymbol(doc.currency);

  return (
    <BasePreview>
      {/* ================= HEADER ================= */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{doc.name}</div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.employee}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.company}
          </div>
        </div>

        <div className="shrink-0 text-end">
          <div className="text-sm text-muted-foreground">
            {doc.posting_date || doc.creation}
          </div>

          <Badge className="mt-1 bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {doc.workflow_state || doc.approval_status || doc.status}
          </Badge>

          <div className="mt-1 font-bold">
            {symbol}
            {doc.total_claimed_amount}
          </div>
        </div>
      </div>

      {/* ================= EXPENSE LIST ================= */}
      <div className="max-h-[55vh] overflow-y-auto pe-1.5">
        <div className="mb-2 font-semibold">
          {t("approvals.preview.expenses")}
        </div>

        <div className="flex flex-col gap-2">
          {doc.expenses?.map((e) => (
            <div key={e.name} className="rounded-lg border border-border p-2">
              {/* TOP */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-semibold">{e.expense_type}</div>
                <div className="shrink-0 font-semibold">
                  {symbol}
                  {e.amount}
                </div>
              </div>

              {/* DETAILS */}
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                {e.expense_date && <span>📅 {e.expense_date}</span>}
                {e.project && <span>📁 {e.project}</span>}
              </div>

              {/* DESCRIPTION */}
              {e.description && (
                <div
                  className="mt-1 break-words text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: e.description }}
                />
              )}

              {/* RECEIPT */}
              {e.receipt && (
                <div className="mt-1">
                  <a
                    href={e.receipt}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Paperclip className="size-3.5" />
                    {t("approvals.preview.viewReceipt")}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ================= TOTAL ================= */}
      <div className="mt-3 border-t border-border pt-2">
        <div className="flex items-center justify-between font-bold">
          <span>{t("approvals.preview.totalClaimed")}</span>
          <span>
            {symbol}
            {doc.total_claimed_amount}
          </span>
        </div>
      </div>

      {/* ================= REMARKS ================= */}
      {doc.remark && (
        <div className="mt-3">
          <div className="mb-1 text-sm font-semibold">
            {t("approvals.preview.remarks")}
          </div>
          <div className="break-words text-sm text-muted-foreground">
            {doc.remark}
          </div>
        </div>
      )}
    </BasePreview>
  );
}
