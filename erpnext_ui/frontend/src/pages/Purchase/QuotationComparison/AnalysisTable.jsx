import AnalysisMarkdown from "./AnalysisMarkdown";

/** Older saved analyses were plain Markdown; preserve their readable view. */
export default function AnalysisTable({ text, quotations }) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return <AnalysisMarkdown text={text} />; }
  if (!Array.isArray(parsed?.quotations)) return <AnalysisMarkdown text={text} />;
  const byName = new Map(parsed.quotations.map((entry) => [entry.quotation, entry]));
  const factors = [["strengths", "Strengths"], ["concerns", "Concerns and missing information"], ["questions", "Questions to ask"]];
  return <div className="max-w-full overflow-x-auto rounded-lg border border-border" role="region" aria-label="AI observations by quotation" tabIndex={0}>
    <table className="w-full border-separate border-spacing-0 text-sm"><thead><tr><th scope="col" className="sticky start-0 z-10 min-w-40 bg-table-header px-3 py-2 text-start">Factor</th>{quotations.map((quote) => <th key={quote.name} scope="col" className="min-w-56 bg-table-header px-3 py-2 text-start"><div>{quote.supplier}</div><div className="text-xs font-normal text-muted-foreground">{quote.name}</div></th>)}</tr></thead><tbody>{factors.map(([field, label]) => <tr key={field}><th scope="row" className="sticky start-0 z-10 border-t border-border bg-card px-3 py-3 text-start align-top">{label}</th>{quotations.map((quote) => { const items = byName.get(quote.name)?.[field]; return <td key={quote.name} className="border-t border-border bg-card px-3 py-3 align-top">{Array.isArray(items) && items.length ? <ul className="list-disc space-y-2 ps-4">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <span className="text-muted-foreground">No supported observation</span>}</td>; })}</tr>)}</tbody></table>
  </div>;
}
