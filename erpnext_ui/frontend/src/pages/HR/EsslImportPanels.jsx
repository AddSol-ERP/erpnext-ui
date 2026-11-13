import { useState } from "react";
import { useTranslation } from "react-i18next";
import LinkField from "../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 8;
const head = "sticky top-0 z-10 bg-background p-3 text-start font-medium border-b";
const cell = "p-3 align-top";

function Pager({ offset, total, size, onChange }) {
  const { t } = useTranslation();
  return <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
    <span>{total ? offset + 1 : 0}–{Math.min(offset + size, total)} / {total}</span>
    <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>{t("esslImport.previous")}</Button>
      <Button variant="outline" disabled={offset + size >= total} onClick={() => onChange(offset + size)}>{t("esslImport.next")}</Button></div>
  </div>;
}

export function EmployeeMappingPanel({ employees, mapping, company, locked, onChange }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = search.trim().toLocaleLowerCase();
  const filtered = employees.filter((emp) => (!reviewOnly || !mapping[emp.code]) &&
    `${emp.code} ${emp.report_name} ${mapping[emp.code] || ""}`.toLocaleLowerCase().includes(query));
  const start = Math.min(offset, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1) * PAGE_SIZE);
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{t("esslImport.mappingHint")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label={t("esslImport.searchEmployees")} placeholder={t("esslImport.searchEmployees")} className="max-w-sm" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewOnly} onChange={(event) => { setReviewOnly(event.target.checked); setOffset(0); }} />{t("esslImport.unmappedOnly")}</label>
    </div>
    <div className="max-h-[45vh] overflow-auto rounded-lg border" data-testid="employee-mapping-scroll">
      <table className="w-full text-sm"><thead><tr>{["code", "name", "employee", "match"].map((key) => <th className={head} key={key}>{t(`esslImport.${key}`)}</th>)}</tr></thead>
        <tbody>{filtered.slice(start, start + PAGE_SIZE).map((emp) => <tr key={emp.code} className="border-b last:border-0">
          <td className={cell}>{emp.code}</td><td className={cell}>{emp.report_name}</td>
          <td className={`${cell} min-w-64`}><LinkField doctype="Employee" value={mapping[emp.code] || ""} disabled={locked} filters={{ company, status: "Active" }} onChange={(value) => onChange(emp.code, value)} /></td>
          <td className={`${cell} text-muted-foreground`}>{emp.saved && mapping[emp.code] === emp.employee ? t("esslImport.savedMatch") : emp.reason}</td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <p className="p-6 text-center text-muted-foreground">{reviewOnly ? t("esslImport.allMapped") : t("esslImport.noResults")}</p>}
    </div>
    <Pager offset={start} total={filtered.length} size={PAGE_SIZE} onChange={setOffset} />
  </div>;
}

export function AttendancePreviewPanel({ preview }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const query = search.trim().toLocaleLowerCase();
  const eligible = (row) => !row.skip_reason && !row.existing_attendance && !row.error;
  const outcome = (row) => row.error || row.warnings.length ? "attention" : eligible(row) ? "eligible" : "skipped";
  const filtered = preview.rows.filter((row) => {
    const ready = eligible(row);
    return (filter === "all" || (filter === "eligible" && ready) || (filter === "skipped" && !ready) || (filter === "attention" && (row.error || row.warnings.length))) &&
      `${row.employee || row.employee_code} ${row.employee_name || ""} ${row.attendance_date} ${row.status}`.toLocaleLowerCase().includes(query);
  });
  const employees = new Map();
  for (const row of filtered) {
    if (!employees.has(row.employee_code)) employees.set(row.employee_code, { code: row.employee_code, name: row.employee_name, employee: row.employee, days: new Map() });
    employees.get(row.employee_code).days.set(row.attendance_date, row);
  }
  const sourceDays = new Set(preview.rows.map((row) => `${row.employee_code}:${row.attendance_date}`));
  // ISO day strings and UTC formatting keep September 1 on the same day in every timezone.
  const months = [...new Set(preview.rows.map((row) => row.attendance_date.slice(0, 7)))].sort();
  const dates = months.flatMap((month) => {
    const [year, number] = month.split("-").map(Number);
    const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  });
  const weekdays = new Intl.DateTimeFormat(i18n.language || "en", { weekday: "short", timeZone: "UTC" });
  const size = 15;
  const start = Math.min(offset, Math.max(0, Math.ceil(employees.size / size) - 1) * size);
  const tones = { eligible: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", skipped: "bg-muted text-muted-foreground", attention: "bg-amber-500/15 text-amber-900 dark:text-amber-300" };
  const notes = (row) => [row.action, row.existing_attendance, row.error, ...row.warnings].filter(Boolean).join("; ");
  const status = (row) => row.status === "Present" ? "P" : row.status === "Half Day" ? "½P" : row.status === "Absent" ? "A" : row.status;
  return <div className="space-y-3">
    {preview.blocked && <p className="text-sm text-destructive">{t("esslImport.blocked")}</p>}
    {preview.errors.length > 0 && <details className="rounded-lg border p-3 text-sm"><summary>{t("esslImport.sourceErrors", { count: preview.errors.length })}</summary>
      <div className="max-h-32 overflow-auto pt-2">{preview.errors.map((entry, index) => <p key={index} className="text-destructive">{entry.source}: {entry.error}</p>)}</div></details>}
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label={t("esslImport.searchDays")} placeholder={t("esslImport.searchDays")} className="max-w-sm" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); setSelected(null); }} />
      <select aria-label={t("esslImport.filterDays")} className="rounded-lg border bg-background p-2 text-sm" value={filter} onChange={(event) => { setFilter(event.target.value); setOffset(0); setSelected(null); }}>
        {["all", "eligible", "skipped", "attention"].map((value) => <option key={value} value={value}>{t(`esslImport.filters.${value}`)}</option>)}
      </select>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {["eligible", "skipped", "attention"].map((key) => <span key={key} className={`rounded px-2 py-1 ${tones[key]}`}>{t(`esslImport.filters.${key}`)}</span>)}
      <span>{t("esslImport.matrixHint")}</span>
    </div>
    <div className="max-h-[50vh] overflow-auto rounded-lg border" data-testid="attendance-preview-scroll" tabIndex={0} role="region" aria-label={t("esslImport.attendancePreview")}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm" data-testid="attendance-monthly-grid"><thead><tr>
        <th scope="col" className={`${head} start-0 z-40 min-w-52 max-w-64 border-e`} data-testid="fixed-employee-header">{t("esslImport.employee")}</th>
        {dates.map((date) => <th scope="col" key={date} title={date} className={`${head} min-w-20 text-center`}>
          <span className="block">{Number(date.slice(-2))}</span><span className="text-xs font-normal text-muted-foreground">{weekdays.format(new Date(`${date}T00:00:00Z`))}</span>
        </th>)}
      </tr></thead><tbody>{[...employees.values()].slice(start, start + size).map((employee) => <tr key={employee.code}>
        <th scope="row" className="sticky start-0 z-20 min-w-52 max-w-64 border-b border-e bg-background p-3 text-start font-normal" data-testid="fixed-employee-cell">
          <span className="block font-medium">{employee.name || employee.employee || employee.code}</span>
          <span className="block text-xs text-muted-foreground">{employee.employee || employee.code}</span>
        </th>
        {dates.map((date) => {
          const row = employee.days.get(date);
          return <td key={date} className="border-b border-e p-1 text-center">
            {row ? <button type="button" aria-pressed={selected === row} aria-label={`${employee.name || employee.code}, ${date}: ${row.status}; ${notes(row)}`} title={`${date} · ${row.status} · ${Number(row.working_hours).toFixed(2)}h\n${notes(row)}`}
              onClick={() => setSelected(row)} className={`w-full min-w-16 rounded-md px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${tones[outcome(row)]} ${selected === row ? "ring-2 ring-ring" : ""}`}>
              <span className="block font-medium">{status(row)}</span><span className="block text-[11px]">{Number(row.working_hours).toFixed(2)}h</span>
            </button> : <span className="text-muted-foreground/50" title={t(sourceDays.has(`${employee.code}:${date}`) ? "esslImport.filteredDay" : "esslImport.noReportDay")}>—</span>}
          </td>;
        })}
      </tr>)}</tbody></table>{!employees.size && <p className="p-6 text-center text-muted-foreground">{t("esslImport.noResults")}</p>}
    </div>
    <Pager offset={start} total={employees.size} size={size} onChange={(value) => { setOffset(value); setSelected(null); }} />
    {selected && <section className="rounded-lg border bg-muted/30 p-3 text-sm" aria-label={t("esslImport.dayDetails")}>
      <div className="flex items-center justify-between gap-2"><h3 className="font-medium">{selected.employee_name || selected.employee || selected.employee_code} · {selected.attendance_date}</h3>
        <Button variant="ghost" onClick={() => setSelected(null)}>{t("esslImport.closeDetails")}</Button></div>
      <dl className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">{[["status", selected.status], ["in", selected.in_time], ["out", selected.out_time], ["shift", selected.shift]].map(([key, value]) => <div key={key}><dt className="text-xs text-muted-foreground">{t(`esslImport.${key}`)}</dt><dd>{value || "—"}</dd></div>)}</dl>
      <p className="mt-2 text-muted-foreground">{notes(selected)}</p>
    </section>}
  </div>;
}
