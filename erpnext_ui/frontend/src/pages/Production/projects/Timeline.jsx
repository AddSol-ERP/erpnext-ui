import { useTranslation } from "react-i18next";

import { useEffect, useState } from "react";
import { timelineRows, stamp } from "./manufacturingTimeline";
export default function Timeline({ orders, cards, onOrder, onJob }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const rows = timelineRows(orders, cards, now);
  const dates = rows.flatMap((r) => [r.start, r.end, r.actualStart, r.actualEnd]).map(stamp).filter(Number.isFinite);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("manufacturing.noOrders")}</p>;
  const min = dates.length ? Math.min(...dates) : now;
  const max = Math.max(min + 86400000, ...dates);
  const bar = (start, end, actual) => {
    const a = stamp(start), b = stamp(end);
    if (!Number.isFinite(a)) return null;
    return <span title={`${start} → ${end || "…"}`} className={`absolute h-2 rounded ${actual ? "top-4 bg-emerald-500" : "top-1 bg-primary/40"}`}
      style={{ left: `${Math.max(0, 100 * (a - min) / (max - min))}%`, width: `${Math.max(0.5, 100 * ((Number.isFinite(b) ? b : a) - a) / (max - min))}%` }} />;
  };
  return <div className="overflow-x-auto"><div className="min-w-[800px] space-y-2">
    <div className="grid grid-cols-[260px_1fr_180px] gap-4 text-xs text-muted-foreground"><span>{t("manufacturing.timelineLegend")}</span><span className="flex justify-between"><span>{new Date(min).toLocaleString()}</span><span>{new Date(max).toLocaleString()}</span></span><span>{t("manufacturing.execution")}</span></div>
    {rows.map((row) => <div key={row.name} className="grid grid-cols-[260px_1fr_180px] items-center gap-4 border-b py-2 text-xs">
      <button className={`text-start hover:underline ${row.kind === "job" ? "ps-5" : "font-semibold"}`} onClick={() => row.kind === "job" ? onJob(row) : onOrder(row)}>{row.name}<span className="block text-muted-foreground">{row.operation || row.production_item} · {row.status}</span></button>
      <div className="relative h-7 rounded bg-muted">{bar(row.start, row.end, false)}{bar(row.actualStart, row.actualEnd, true)}{!row.start && !row.actualStart && <span>{t("manufacturing.unscheduled")}</span>}</div>
      <span>{row.progress.toFixed(0)}% · {Number(row.minutes || 0).toFixed(1)} {t("manufacturing.minutes")}<span className="block text-muted-foreground">{row.actualStart || "—"} → {row.actualEnd || "—"}</span></span>
    </div>)}
  </div></div>;
}
