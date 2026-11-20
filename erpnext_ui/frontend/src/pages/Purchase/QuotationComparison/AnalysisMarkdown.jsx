/** Render a safe subset of model Markdown as React nodes; never render HTML. */
function inline(text) {
  return String(text || "").split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-muted px-1 text-xs">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const separator = (line) => /^\s*\|?\s*:?-{3,}/.test(line || "");

export default function AnalysisMarkdown({ text }) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.includes("|") && separator(lines[i + 1])) {
      const headings = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim().includes("|")) rows.push(cells(lines[i++]));
      blocks.push(<div key={i} className="max-w-full overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead className="bg-table-header"><tr>{headings.map((heading, j) => <th key={j} className="min-w-32 px-3 py-2 text-start font-semibold">{inline(heading)}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row, j) => <tr key={j}>{headings.map((_, k) => <td key={k} className="px-3 py-2 align-top">{inline(row[k])}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^---+$/.test(line)) { i++; continue; }
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) { blocks.push(<h3 key={i} className="pt-2 text-base font-semibold text-foreground">{inline(heading[1])}</h3>); i++; continue; }
    if (/^(?:[-*]\s+|\d+[.)]\s+)/.test(line)) {
      const entries = []; const numbered = /^\d/.test(line);
      while (i < lines.length && /^(?:[-*]\s+|\d+[.)]\s+)/.test(lines[i].trim())) entries.push(lines[i++].trim().replace(/^(?:[-*]\s+|\d+[.)]\s+)/, ""));
      const List = numbered ? "ol" : "ul";
      blocks.push(<List key={i} className={`space-y-1 ps-5 ${numbered ? "list-decimal" : "list-disc"}`}>{entries.map((entry, j) => <li key={j}>{inline(entry)}</li>)}</List>); continue;
    }
    blocks.push(<p key={i} className="leading-relaxed">{inline(line)}</p>); i++;
  }
  return <div className="min-w-0 space-y-4 text-sm text-foreground">{blocks}</div>;
}
