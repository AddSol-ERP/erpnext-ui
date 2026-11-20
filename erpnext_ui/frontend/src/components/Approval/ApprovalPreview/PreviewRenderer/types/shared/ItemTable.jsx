import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatMoney, formatQty } from "@/lib/money";
import { RICH_TEXT_CLASS } from "./prose";
import { cn } from "cn";

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * One-line plain-text preview of a Text Editor description.
 *
 * The description cannot be rendered as HTML inside the collapsed row: the
 * editor emits block elements (`<p>`, `<ul>`, `<table>`), and every one of them
 * starts a new line no matter what `line-clamp` says, so the "one line" row
 * grew to the full height of the description -- the exact problem this table
 * exists to fix. Stripping to text gives a predictable single line, and the
 * full HTML is rendered only when the row is expanded.
 */
function descriptionText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ItemCell({ item }) {
  const description = descriptionText(item.description);
  const showDescription =
    description &&
    description.toLowerCase() !== String(item.item_name || "").toLowerCase();

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{item.item_code || item.item_name}</span>

        {item.item_name && item.item_name !== item.item_code && (
          <span className="truncate text-xs text-muted-foreground">
            {item.item_name}
          </span>
        )}

        {item.is_free_item ? (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
            {item.__freeLabel}
          </span>
        ) : null}
      </div>

      {showDescription && (
        <div
          className="truncate text-xs text-muted-foreground"
          title={description}
        >
          {description}
        </div>
      )}

      {item.project && (
        <div className="truncate text-[11px] text-muted-foreground">
          {item.__projectLabel}: {item.project}
        </div>
      )}
    </div>
  );
}

/**
 * Line items as a compact table instead of one card per line.
 *
 * A quotation with six lines used to consume most of two screens: every card
 * carried the code, the full rich-text description, the project and a
 * separate row for qty/rate/amount. Here each line is ~38px, the description
 * is a single line that expands on demand, and the numbers line up in columns
 * so the amounts can be scanned rather than read.
 *
 * Keys are the child row's own `name`, which never changes in this read-only
 * view (see AGENTS.md invariant 22 for why an index-plus-value key is
 * forbidden on editable rows -- there are no inputs here).
 */
export default function ItemTable({ items, currency }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState({});
  const rows = Array.isArray(items) ? items : [];

  const totalQty = rows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);

  const toggle = (key) =>
    setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t("approvals.preview.itemsCount", { n: rows.length })}
        </h3>

        {totalQty > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("approvals.preview.totalQty", { qty: formatQty(totalQty) })}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("approvals.preview.noItems")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-6 py-1" aria-hidden />
                <th className="hidden w-8 py-1 pe-2 text-start font-medium sm:table-cell">
                  #
                </th>
                <th className="py-1 pe-2 text-start font-medium">
                  {t("approvals.preview.itemColumn")}
                </th>
                <th className="w-24 py-1 pe-2 text-end font-medium">
                  {t("approvals.preview.qtyColumn")}
                </th>
                <th className="hidden w-28 py-1 pe-2 text-end font-medium sm:table-cell">
                  {t("approvals.preview.rate")}
                </th>
                <th className="w-28 py-1 text-end font-medium">
                  {t("approvals.preview.amount")}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((item, index) => {
                const key = item.name || index;
                const description = descriptionText(item.description);
                const isOpen = Boolean(expanded[key]);

                // The labels are injected here so `ItemCell` stays a pure
                // renderer and the translation hook lives in one place.
                const row = {
                  ...item,
                  __freeLabel: t("approvals.preview.free"),
                  __projectLabel: t("approvals.preview.projectLabel"),
                };

                return (
                  <Fragment key={key}>
                    <tr
                      className={cn(
                        "border-b border-border/50 align-top",
                        isOpen ? "border-transparent" : "last:border-0",
                      )}
                    >
                      <td className="py-1.5">
                        {description ? (
                          <button
                            type="button"
                            onClick={() => toggle(key)}
                            aria-expanded={isOpen}
                            aria-label={t(
                              isOpen
                                ? "approvals.preview.collapseDescription"
                                : "approvals.preview.expandDescription",
                            )}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {isOpen ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                            )}
                          </button>
                        ) : null}
                      </td>

                      <td className="hidden py-1.5 pe-2 text-xs text-muted-foreground tabular-nums sm:table-cell">
                        {index + 1}
                      </td>

                      <td className="min-w-0 py-1.5 pe-2">
                        <ItemCell item={row} />
                      </td>

                      <td className="whitespace-nowrap py-1.5 pe-2 text-end tabular-nums">
                        {formatQty(item.qty)}{" "}
                        <span className="text-xs text-muted-foreground">
                          {item.uom || item.stock_uom || ""}
                        </span>
                      </td>

                      <td className="hidden whitespace-nowrap py-1.5 pe-2 text-end tabular-nums text-muted-foreground sm:table-cell">
                        {formatMoney(item.rate, currency)}
                        {Number(item.discount_percentage) > 0 && (
                          <div className="text-[11px]">
                            -{item.discount_percentage}%
                          </div>
                        )}
                      </td>

                      <td className="whitespace-nowrap py-1.5 text-end font-medium tabular-nums">
                        {formatMoney(item.amount, currency)}
                      </td>
                    </tr>

                    {isOpen && description && (
                      <tr className="border-b border-border/50 last:border-0">
                        <td colSpan={6} className="pb-2 pe-2 ps-8">
                          <div
                            className={RICH_TEXT_CLASS}
                            dangerouslySetInnerHTML={{
                              __html: item.description,
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
