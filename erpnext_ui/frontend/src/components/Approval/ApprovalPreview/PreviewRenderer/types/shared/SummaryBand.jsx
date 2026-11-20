import { StatusBadge } from "@/components/List/StatusBadge";
import { formatMoney } from "@/lib/money";
import { cn } from "cn";

/**
 * The document's identity strip: who it is for, when it was raised, how much it
 * is worth, and where it stands.
 *
 * Shared by the Quotation and Purchase Order previews so the two approval
 * screens read the same. On the document side the figure an approver looks for
 * first is the payable total, so it is set large and right-aligned at the
 * desktop breakpoint instead of being buried in the totals list below.
 *
 * `facts` arrive already filtered: an entry with no value must not render,
 * because a grid of "—" reads as a broken document rather than as a document
 * with optional fields left blank.
 */
export default function SummaryBand({
  name,
  heading,
  subheading,
  contacts = [],
  facts = [],
  badges = [],
  total,
  currency,
  inWords,
}) {
  const contactLine = contacts.filter(Boolean).join(" · ");

  return (
    <section className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-0.5">
          {name && (
            <div className="text-xs font-medium text-muted-foreground">
              {name}
            </div>
          )}

          {heading && (
            <h2 className="truncate text-lg font-semibold leading-tight">
              {heading}
            </h2>
          )}

          {/* The title is free text an operator may or may not have filled in;
              when it merely repeats the heading it adds nothing. */}
          {subheading && subheading !== heading && (
            <p className="truncate text-sm text-muted-foreground">
              {subheading}
            </p>
          )}

          {contactLine && (
            <p className="truncate text-xs text-muted-foreground">
              {contactLine}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 md:items-end">
          {badges.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
              {badges.map((badge) => (
                <StatusBadge key={badge.label} tone={badge.tone}>
                  {badge.label}
                </StatusBadge>
              ))}
            </div>
          )}

          <div className="text-2xl font-bold leading-tight tabular-nums">
            {formatMoney(total, currency)}
          </div>

          {inWords && (
            <div className="max-w-xs text-xs italic text-muted-foreground md:text-end">
              {inWords}
            </div>
          )}
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {fact.label}
              </dt>
              <dd
                className={cn(
                  "truncate text-sm font-medium",
                  fact.muted && "text-muted-foreground",
                )}
                title={String(fact.value)}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
