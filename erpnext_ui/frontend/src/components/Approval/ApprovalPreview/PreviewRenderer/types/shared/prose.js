/**
 * Styling for Text Editor HTML rendered read-only (Terms & Conditions, item
 * descriptions, address blocks).
 *
 * These fields carry whatever the author typed in Frappe's editor -- `<p>`,
 * `<ol>`, `<ul>`, nested `<table>` -- and an unstyled `dangerouslySetInnerHTML`
 * renders them flush against the card edge with no spacing, which on a
 * management-facing quotation looks like pasted text rather than a document.
 *
 * Logical properties (`ps-*` rather than `pl-*`) so the same class is correct in
 * the Arabic/RTL locale. Kept as one exported string so the Terms card and the
 * expanded item description cannot drift apart.
 */
export const RICH_TEXT_CLASS =
  "break-words text-sm leading-relaxed text-muted-foreground " +
  "[&_a]:text-primary [&_a]:underline " +
  "[&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:ps-5 " +
  "[&_p]:mb-1.5 [&_p:last-child]:mb-0 " +
  "[&_strong]:font-semibold [&_strong]:text-foreground " +
  "[&_table]:w-full [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 " +
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 " +
  "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:ps-5";
