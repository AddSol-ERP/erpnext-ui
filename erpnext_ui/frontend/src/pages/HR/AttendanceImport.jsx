import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMethod, post, uploadFile } from "../../services/api";
import { useHeader } from "../../context/HeaderContext";
import useEsslImportAccess from "../../hooks/useEsslImportAccess";
import LinkField from "../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "method/erpnext_ui.essl_import.";
const JOB_KEY = "erpnext_ui:essl-import";

export default function AttendanceImport() {
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const access = useEsslImportAccess();
  const [company, setCompany] = useState("");
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [submit, setSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [jobStatus, setJobStatus] = useState("");
  const [jobToken, setJobToken] = useState(() => typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(JOB_KEY));
  const [offset, setOffset] = useState(0);
  const locked = busy || Boolean(jobToken);

  useEffect(() => {
    setHeader({ title: t("esslImport.title"), subtitle: t("esslImport.subtitle"), breadcrumbs: [
      { label: t("common.home"), path: "/" }, { label: t("hr.header.title"), path: "/hr" },
      { label: t("esslImport.title") },
    ] });
    return () => setHeader({});
  }, [setHeader, t]);

  useEffect(() => {
    if (!jobToken) return;
    let active = true;
    let timer;
    async function poll() {
      try {
        const state = await getMethod(API + "import_status", { token: jobToken });
        if (!active) return;
        setJobStatus(state.status);
        if (state.status === "Completed" || state.status === "Failed") {
          if (state.status === "Completed") setResult(state.result);
          else setError(state.error);
          sessionStorage.removeItem(JOB_KEY);
          setJobToken(null);
          setPreview(null);
          return;
        }
        timer = setTimeout(poll, 2500);
      } catch (err) {
        if (!active) return;
        setError(err.message);
        // Keep monitoring transient network failures. The token is owner-checked
        // server-side; an expired token or a different session cannot read it.
        if ([401, 403].includes(err.status)) {
          sessionStorage.removeItem(JOB_KEY);
          setJobToken(null);
        } else timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobToken]);

  const resetPreview = () => { setPreview(null); setOffset(0); };
  const resetMappings = () => { resetPreview(); setEmployees([]); setMapping({}); setResult(null); setError(""); };

  async function validate() {
    if (!company || !file) { setError(t("esslImport.selectSource")); return; }
    if (!file.name.toLowerCase().endsWith(".xls") || file.size > 5 * 1024 * 1024) {
      setError(t("esslImport.fileLimit")); return;
    }
    setBusy(true); setError(""); resetPreview();
    try {
      let source = fileUrl;
      if (!source) {
        const data = new FormData();
        data.append("file", file); data.append("is_private", "1");
        const uploaded = await uploadFile("method/upload_file", data);
        source = uploaded.message.file_url;
        setFileUrl(source);
      }
      const args = { file_url: source, company };
      if (employees.length) args.employee_map = JSON.stringify(mapping);
      const response = await post(API + "preview", args);
      const data = response.message;
      if (!employees.length) {
        setEmployees(data.employees);
        setMapping(Object.fromEntries(data.employees.map((emp) => [emp.code, emp.employee || ""])));
      }
      setPreview(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function importReport() {
    if (!preview || preview.blocked || locked) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await post(API + "import_report", {
        file_url: fileUrl, company, employee_map: JSON.stringify(mapping),
        submit_attendance: submit && access.can_submit ? 1 : 0,
      });
      sessionStorage.setItem(JOB_KEY, response.message.token);
      setJobStatus("Queued"); setJobToken(response.message.token); setPreview(null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const rows = preview?.rows || [];
  const eligible = rows.filter((row) => !row.skip_reason && !row.existing_attendance && !row.error).length;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4">
      <section className="rounded-xl border p-4 space-y-4">
        <p className="text-sm text-muted-foreground">{t("esslImport.instructions")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="text-sm font-medium">{t("esslImport.company")}</label>
            <LinkField doctype="Company" value={company} disabled={locked} onChange={(value) => { setCompany(value); resetMappings(); }} /></div>
          <div><label htmlFor="essl-file" className="text-sm font-medium">{t("esslImport.file")}</label>
            <Input id="essl-file" type="file" accept=".xls" disabled={locked} onChange={(event) => {
              setFile(event.target.files?.[0] || null); setFileUrl(null); resetMappings();
            }} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submit}
          disabled={locked || !access.can_submit} onChange={(event) => { setSubmit(event.target.checked); resetPreview(); }} />
          {t("esslImport.submit")}</label>
        <p className="text-xs text-muted-foreground">{t("esslImport.draftHint")}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={validate} disabled={locked}>{t("esslImport.preview")}</Button>
          <Button onClick={importReport} disabled={locked || !preview || preview.blocked || !eligible}>{t("esslImport.import")}</Button></div>
      </section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {jobToken && <p role="status">{t("esslImport.running", { status: t(`esslImport.job.${jobStatus || "Queued"}`) })}</p>}
      {result && <section className="rounded-xl border p-4 space-y-2" role="status"><h2 className="font-semibold">{t("esslImport.result")}</h2>
        <p>{t("esslImport.totals", { attendance: result.attendance_created, created: result.checkins_created,
          reused: result.checkins_reused, skipped: result.skipped, failed: result.errors.length })}</p>
        {result.errors.map((entry, index) => <p key={index} className="text-sm text-destructive">{entry.source}: {entry.error}</p>)}
      </section>}
      {employees.length > 0 && <section className="rounded-xl border p-4 space-y-3"><h2 className="font-semibold">{t("esslImport.mapping")}</h2>
        <p className="text-sm text-muted-foreground">{t("esslImport.mappingHint")}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
          {["code", "name", "employee", "match"].map((key) => <th className="p-2 text-start" key={key}>{t(`esslImport.${key}`)}</th>)}
        </tr></thead><tbody>{employees.map((emp) => <tr key={emp.code} className="border-t">
          <td className="p-2">{emp.code}</td><td className="p-2">{emp.report_name}</td>
          <td className="p-2 min-w-64"><LinkField doctype="Employee" value={mapping[emp.code]} disabled={locked}
            filters={{ company, status: "Active" }} onChange={(value) => {
              setMapping((current) => ({ ...current, [emp.code]: value })); resetPreview();
            }} /></td><td className="p-2">{emp.reason}</td>
        </tr>)}</tbody></table></div>
      </section>}
      {preview && <section className="rounded-xl border p-4 space-y-3"><h2 className="font-semibold">{t("esslImport.preview")}</h2>
        <p>{t("esslImport.previewTotals", { total: rows.length, eligible, skipped: rows.length - eligible })}</p>
        {preview.blocked && <p className="text-destructive">{t("esslImport.blocked")}</p>}
        {preview.errors.map((entry, index) => <p key={index} className="text-sm text-destructive">{entry.source}: {entry.error}</p>)}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>
          {["employee", "date", "status", "in", "out", "hours", "shift", "notes"].map((key) => <th className="p-2 text-start" key={key}>{t(`esslImport.${key}`)}</th>)}
        </tr></thead><tbody>{rows.slice(offset, offset + 100).map((row) => <tr key={`${row.employee_code}:${row.attendance_date}`} className="border-t">
          <td className="p-2">{row.employee || row.employee_code}</td><td className="p-2 whitespace-nowrap">{row.attendance_date}</td>
          <td className="p-2">{row.status}</td><td className="p-2 whitespace-nowrap">{row.in_time || "—"}</td>
          <td className="p-2 whitespace-nowrap">{row.out_time || "—"}</td><td className="p-2">{Number(row.working_hours).toFixed(2)}</td>
          <td className="p-2">{row.shift || "—"}</td><td className="p-2">{[row.action, row.existing_attendance, row.error, ...row.warnings].filter(Boolean).join("; ")}</td>
        </tr>)}</tbody></table></div>
        <div className="flex items-center gap-3"><Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 100)}>{t("esslImport.previous")}</Button>
          <span className="text-sm">{rows.length ? offset + 1 : 0}–{Math.min(offset + 100, rows.length)} / {rows.length}</span>
          <Button variant="outline" disabled={offset + 100 >= rows.length} onClick={() => setOffset(offset + 100)}>{t("esslImport.next")}</Button></div>
      </section>}
    </div>
  );
}
