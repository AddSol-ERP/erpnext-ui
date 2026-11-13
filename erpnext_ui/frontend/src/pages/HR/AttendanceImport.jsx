import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMethod, post, uploadFile } from "../../services/api";
import { useHeader } from "../../context/HeaderContext";
import useEsslImportAccess from "../../hooks/useEsslImportAccess";
import LinkField from "../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeMappingPanel, AttendancePreviewPanel } from "./EsslImportPanels";

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
  const [activeTab, setActiveTab] = useState("mapping");
  const [mappingNotice, setMappingNotice] = useState("");
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

  const resetPreview = () => { setPreview(null); };
  const resetMappings = () => { resetPreview(); setEmployees([]); setMapping({}); setResult(null); setError(""); setMappingNotice(""); setActiveTab("mapping"); };

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
      setActiveTab(data.employees.some((emp) => !emp.employee) ? "mapping" : "preview");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function saveMappings() {
    setBusy(true); setError(""); setMappingNotice("");
    try {
      const response = await post(API + "save_mappings", { file_url: fileUrl, company, employee_map: JSON.stringify(mapping) });
      setMappingNotice(t("esslImport.mappingSaved", { count: response.message.saved }));
      setEmployees((current) => current.map((emp) => ({ ...emp, employee: mapping[emp.code] || "", saved: Boolean(mapping[emp.code]), reason: mapping[emp.code] ? t("esslImport.savedMatch") : t("esslImport.needsMapping") })));
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
  const unresolved = employees.filter((emp) => !mapping[emp.code]).length;
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <details className="rounded-xl border bg-background" open={!employees.length}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("esslImport.source")} {company && ` · ${company}`} {file && ` · ${file.name}`}</summary>
        <div className="space-y-3 border-t p-4">
          <p className="text-sm text-muted-foreground">{t("esslImport.instructions")}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="text-sm font-medium">{t("esslImport.company")}</label>
              <LinkField doctype="Company" value={company} disabled={locked} onChange={(value) => { setCompany(value); resetMappings(); }} /></div>
            <div><label htmlFor="essl-file" className="text-sm font-medium">{t("esslImport.file")}</label>
              <Input id="essl-file" type="file" accept=".xls" disabled={locked} onChange={(event) => { setFile(event.target.files?.[0] || null); setFileUrl(null); resetMappings(); }} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submit} disabled={locked || !access.can_submit} onChange={(event) => { setSubmit(event.target.checked); resetPreview(); }} />{t("esslImport.submit")}</label>
          <p className="text-xs text-muted-foreground">{t("esslImport.draftHint")}</p>
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("esslImport.rememberHint")}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={validate} disabled={locked}>{t("esslImport.preview")}</Button>
          <Button onClick={importReport} disabled={locked || !preview || preview.blocked || !eligible}>{t("esslImport.import")}</Button></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {mappingNotice && <p role="status" className="text-sm text-muted-foreground">{mappingNotice}</p>}
      {jobToken && <p role="status">{t("esslImport.running", { status: t(`esslImport.job.${jobStatus || "Queued"}`) })}</p>}
      {result && <section className="rounded-xl border p-4 space-y-2" role="status"><h2 className="font-semibold">{t("esslImport.result")}</h2>
        <p className="text-sm">{t("esslImport.totals", { attendance: result.attendance_created, created: result.checkins_created, reused: result.checkins_reused, skipped: result.skipped, failed: result.errors.length })}</p>
        {result.errors.length > 0 && <details><summary className="cursor-pointer text-sm">{t("esslImport.sourceErrors", { count: result.errors.length })}</summary>
          <div className="max-h-36 overflow-auto pt-2">{result.errors.map((entry, index) => <p key={index} className="text-sm text-destructive">{entry.source}: {entry.error}</p>)}</div></details>}
      </section>}
      {employees.length > 0 && <section className="rounded-xl border bg-background">
        <div className="grid grid-cols-2 gap-3 border-b p-4 md:grid-cols-4">
          {[["employeesCount", employees.length], ["unmappedCount", unresolved], ["daysCount", preview ? rows.length : "—"], ["readyCount", preview ? eligible : "—"]].map(([key, count]) => <div key={key}><p className="text-xs text-muted-foreground">{t(`esslImport.${key}`)}</p><p className="text-xl font-semibold">{count}</p></div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div role="tablist" aria-label={t("esslImport.reviewTabs")} className="flex flex-wrap gap-2">
            <Button role="tab" aria-selected={activeTab === "mapping"} aria-controls="essl-mapping-panel" variant={activeTab === "mapping" ? "secondary" : "ghost"} onClick={() => setActiveTab("mapping")}>{t("esslImport.mapping")} · {unresolved}</Button>
            <Button role="tab" aria-selected={activeTab === "preview"} aria-controls="essl-preview-panel" disabled={!preview} variant={activeTab === "preview" ? "secondary" : "ghost"} onClick={() => setActiveTab("preview")}>{t("esslImport.attendancePreview")}</Button>
          </div>
          {activeTab === "mapping" && <Button variant="outline" onClick={saveMappings} disabled={locked || !fileUrl}>{t("esslImport.saveMappings")}</Button>}
        </div>
        <div className="p-4">
          {activeTab === "mapping" && <div role="tabpanel" id="essl-mapping-panel"><EmployeeMappingPanel employees={employees} mapping={mapping} company={company} locked={locked} onChange={(code, value) => {
            setMapping((current) => ({ ...current, [code]: value }));
            setEmployees((current) => current.map((emp) => emp.code === code ? { ...emp, saved: false, reason: t("esslImport.editedMatch") } : emp));
            setMappingNotice(""); resetPreview();
          }} /></div>}
          {activeTab === "preview" && preview && <div role="tabpanel" id="essl-preview-panel"><AttendancePreviewPanel preview={preview} /></div>}
        </div>
      </section>}
    </div>
  );
}
