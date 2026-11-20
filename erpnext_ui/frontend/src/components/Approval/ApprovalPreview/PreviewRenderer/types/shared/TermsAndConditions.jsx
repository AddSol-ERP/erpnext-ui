import { useTranslation } from "react-i18next";
import { RICH_TEXT_CLASS } from "./prose";
import { cn } from "cn";

/**
 * Terms & Conditions, given their own full-width card.
 *
 * On a quotation this is the part an approver is legally signing off, so it
 * gets the width and the typography rather than being the last thing in a
 * narrow sidebar capped at 120px. The text stays scrollable inside its own
 * box: terms are long, and letting them push the items and totals off the
 * screen would trade one readability problem for another.
 *
 * `dangerouslySetInnerHTML` matches the rest of the codebase's handling of Text
 * Editor fields (the server has already sanitised on save).
 */
export default function TermsAndConditions({ html, template }) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t("approvals.termsAndConditions")}
        </h3>

        {template && (
          <span className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {t("approvals.preview.termsTemplate")}: {template}
          </span>
        )}
      </div>

      {html ? (
        <div
          className={cn("max-h-52 overflow-y-auto pe-1", RICH_TEXT_CLASS)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("approvals.preview.noTerms")}
        </p>
      )}
    </section>
  );
}
