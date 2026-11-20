import { RICH_TEXT_CLASS } from "./prose";
import { cn } from "cn";

/**
 * Billing / shipping address blocks, side by side and at the bottom of the
 * preview.
 *
 * They used to sit above the totals in the right-hand column, which pushed the
 * money off the first screen. Addresses still matter for the document, just
 * after the commercial terms, and rendering the block as text (not a list of
 * "not set" rows) keeps it to a few lines.
 */
export default function Addresses({ blocks = [] }) {
  const visible = blocks.filter((block) => Boolean(block.html));

  if (visible.length === 0) return null;

  return (
    <section className="rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((block) => (
          <div key={block.title} className="min-w-0">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {block.title}
            </div>

            <div
              className={cn(RICH_TEXT_CLASS, "text-xs")}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
