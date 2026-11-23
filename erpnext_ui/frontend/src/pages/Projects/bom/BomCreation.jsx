import { createElement, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Copy, FilePlus2, LayoutTemplate, Search } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import FormSection from "../../../components/FormSection";
import { FormField } from "../../../components/FormField";
import LinkField from "../../../components/LinkField";
import AppModal from "../../../components/AppModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function BomCreation() {
  const { project } = useParams();
  return <Creation key={project} project={project} />;
}

function Creation({ project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("fresh");
  const [source, setSource] = useState("");
  const [orders, setOrders] = useState(null);
  const [order, setOrder] = useState("");
  const [packageError, setPackageError] = useState("");
  const [packageResult, setPackageResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(null);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState(null);
  const [showComponents, setShowComponents] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");
  const searchTerm = componentSearch.trim().toLocaleLowerCase();
  const visibleComponents = (config?.config.items || []).filter((item) =>
    [item.number, item.item_name, item.item_group].some((value) => String(value || "").toLocaleLowerCase().includes(searchTerm)),
  );
  const back = `/projects/view/${encodeURIComponent(project)}`;
  useEffect(() => {
    let active = true;
    get(`resource/Project/${encodeURIComponent(project)}`).then((res) => {
      if (active) setCompany(res.data.company);
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project]);
  useEffect(() => {
    if (orders === null) return;
    let active = true;
    get("method/addsol_devoltrans_custom.api.design_package.configuration", { project })
      .then((res) => {
        if (!active) return;
        setConfig(res.message);
        setSelected(res.message.config.items.map((item) => item.number));
      })
      .catch((e) => { if (active) setPackageError(e.message); });
    return () => { active = false; };
  }, [project, orders]);
  useEffect(() => {
    let active = true;
    get("method/addsol_devoltrans_custom.api.design_package.sales_orders", { project })
      .then((res) => { if (active) setOrders(res.message || []); })
      .catch(() => { if (active) setOrders(null); });
    return () => { active = false; };
  }, [project]);
  useEffect(() => {
    setHeader({ title: t("manufacturing.createBom"), subtitle: project,
      breadcrumbs: [{ label: t("projects.title"), path: "/projects" }, { label: project, path: back }, { label: t("manufacturing.createBom") }],
      actions: [{ label: t("common.back"), icon: ArrowLeft, variant: "btn-outline-secondary", onClick: () => navigate(back) }],
    });
    return () => setHeader({});
  }, [project, back, navigate, setHeader, t]);
  const options = [
    { key: "template", icon: LayoutTemplate },
    { key: "copy", icon: Copy },
    { key: "fresh", icon: FilePlus2 },
  ];
  const start = () => navigate("/projects/BOM/new", { state: {
    manufacturingProject: project, manufacturingCompany: company,
    ...(mode !== "fresh" ? { bomSource: source, bomSourceType: mode === "template" ? "UI BOM Template" : "BOM" } : {}),
  } });
  const createPackage = async () => {
    setBusy(true);
    setPackageError("");
    setPackageResult(null);
    try {
      const response = await post("method/addsol_devoltrans_custom.api.design_package.create", { project, sales_order: order, selected, revision: config.revision });
      setPackageResult(response.message);
      setShowComponents(false);
    } catch (e) { setPackageError(e.message); }
    finally { setBusy(false); }
  };
  const editConfig = () => {
    setDraftConfig({ routing: config.config.routing, items: config.config.items.map((item) => ({ ...item })) });
    setEditing(true);
    setPackageError("");
  };
  const changeItem = (index, field, value) => setDraftConfig((current) => ({ ...current,
    items: current.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
  }));
  const saveConfig = async () => {
    setBusy(true);
    setPackageError("");
    try {
      const response = await post("method/addsol_devoltrans_custom.api.design_package.save_configuration", { project, config: draftConfig, revision: config.revision });
      setConfig(response.message);
      setSelected(response.message.config.items.map((item) => item.number));
      setEditing(false);
    } catch (e) { setPackageError(e.message); }
    finally { setBusy(false); }
  };
  return <DashboardShell>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {orders !== null && <FormSection title={t("bomCreation.designPackage")} description={t("bomCreation.designPackageHelp")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="min-w-0 flex-1 md:max-w-xl"><FormField label={t("bomCreation.salesOrder")} required>
        <select className="h-9 w-full rounded border border-input bg-background px-3 text-sm" value={order} onChange={(event) => { setOrder(event.target.value); setPackageResult(null); }} disabled={busy}>
          <option value="">{t("bomCreation.selectOrder")}</option>
          {orders.map((row) => <option key={row.name} value={row.name}>{row.name} · {row.transaction_date}</option>)}
        </select>
      </FormField></div>
      <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
        {config?.can_edit && <Button type="button" className="w-full sm:w-auto" variant="outline" disabled={busy || editing} onClick={editConfig}>{t("bomCreation.editDefaults")}</Button>}
        <Button type="button" className="w-full sm:w-auto" disabled={!order || !config || busy || editing} onClick={() => { setPackageError(""); setPackageResult(null); setComponentSearch(""); setShowComponents(true); }}>{t("bomCreation.createPackage")}</Button>
      </div>
      </div>
      {!orders.length && <p className="mt-2 text-sm text-muted-foreground">{t("bomCreation.noOrders")}</p>}
      {draftConfig && <AppModal show={editing} onClose={() => { if (!busy) setEditing(false); }} title={t("bomCreation.editDefaults")} width="xl" footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setDraftConfig((current) => ({ ...current, items: [...current.items, { number: "", item_name: "", item_group: "", qty: 1 }] }))}>{t("bomCreation.addComponent")}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
        <Button type="button" disabled={busy} onClick={saveConfig}>{t("bomCreation.saveDefaults")}</Button>
      </>}><div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("bomCreation.defaultsHelp")}</p>
        <FormField label={t("bomCreation.designRouting")} required><LinkField doctype="Routing" value={draftConfig.routing} onChange={(value) => setDraftConfig((current) => ({ ...current, routing: value }))} disabled={busy} /></FormField>
        <Table className="min-w-[850px]" containerClassName="max-h-[50vh] overflow-auto border border-border" containerProps={{ tabIndex: 0, role: "region", "aria-label": t("bomCreation.selectComponents") }}>
          <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
            <TableHead scope="col">{t("bomCreation.componentCode")}</TableHead>
            <TableHead scope="col">{t("bomCreation.componentName")}</TableHead>
            <TableHead scope="col">{t("bomCreation.componentGroup")}</TableHead>
            <TableHead scope="col">{t("bomCreation.componentQty")}</TableHead>
            <TableHead scope="col"><span className="sr-only">{t("bomCreation.removeComponent")}</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{draftConfig.items.map((item, index) => <TableRow key={index}>
            <TableCell className="min-w-32"><Input aria-label={`${t("bomCreation.componentCode")} ${index + 1}`} value={item.number} onChange={(event) => changeItem(index, "number", event.target.value)} disabled={busy} /></TableCell>
            <TableCell className="min-w-48"><Input aria-label={`${t("bomCreation.componentName")} ${index + 1}`} value={item.item_name} onChange={(event) => changeItem(index, "item_name", event.target.value)} disabled={busy} /></TableCell>
            <TableCell className="min-w-56"><label><span className="sr-only">{t("bomCreation.componentGroup")} {index + 1}</span><LinkField doctype="Item Group" filters={{ is_group: 0 }} value={item.item_group} onChange={(value) => changeItem(index, "item_group", value)} disabled={busy} /></label></TableCell>
            <TableCell className="min-w-28"><Input aria-label={`${t("bomCreation.componentQty")} ${index + 1}`} type="number" min="0.001" step="any" value={item.qty} onChange={(event) => changeItem(index, "qty", event.target.value)} disabled={busy} /></TableCell>
            <TableCell><Button type="button" variant="outline" disabled={busy} onClick={() => setDraftConfig((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>{t("bomCreation.removeComponent")}</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {packageError && <p role="alert" className="text-destructive">{packageError}</p>}
      </div></AppModal>}
      {packageError && !showComponents && !editing && <p role="alert" className="mt-2 text-destructive">{packageError}</p>}
      {packageResult && <div role="status" className="mt-3 text-sm">
        <p>{t(packageResult.created.length ? "bomCreation.packageCreated" : "bomCreation.packageNoNew")}</p>
        {packageResult.created.map((name) => <button key={name} type="button" className="mr-3 text-primary underline" onClick={() => navigate(`/projects/BOM/${encodeURIComponent(name)}`)}>{name}</button>)}
      </div>}
      {config && <AppModal show={showComponents} onClose={() => { if (!busy) setShowComponents(false); }} title={t("bomCreation.selectComponents")} width="lg" footer={<>
        <Button type="button" variant="outline" disabled={busy} onClick={() => setShowComponents(false)}>{t("common.cancel")}</Button>
        <Button type="button" disabled={busy} onClick={createPackage}>{t(busy ? "bomCreation.creatingPackage" : "bomCreation.continuePackage")}</Button>
      </>}>
        <div className="space-y-4">
          <div><p className="text-sm font-medium">{t("bomCreation.salesOrder")}: {order}</p><p className="mt-1 text-sm text-muted-foreground">{t("bomCreation.componentsHelp")}</p></div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium" aria-live="polite">{t("bomCreation.selectedCount", { selected: selected.length, total: config.config.items.length })}</p>
            <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={busy || selected.length === config.config.items.length} onClick={() => setSelected(config.config.items.map((item) => item.number))}>{t("bomCreation.selectAll")}</Button><Button type="button" variant="outline" size="sm" disabled={busy || !selected.length} onClick={() => setSelected([])}>{t("bomCreation.clearAll")}</Button></div>
          </div>
          <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={componentSearch} onChange={(event) => setComponentSearch(event.target.value)} disabled={busy} aria-label={t("bomCreation.searchComponents")} placeholder={t("bomCreation.searchComponents")} /></div>
          <div className="max-h-80 overflow-auto rounded-md border border-border" role="group" aria-label={t("bomCreation.selectComponents")}>
            {visibleComponents.length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">{t("bomCreation.noMatchingComponents")}</p>}
            {visibleComponents.map((item) => <label key={item.number} className={`flex cursor-pointer items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-muted/60 ${selected.includes(item.number) ? "bg-primary/5" : ""}`}>
              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" disabled={busy} checked={selected.includes(item.number)} onChange={(event) => { const checked = event.target.checked; setSelected((current) => checked ? [...current, item.number] : current.filter((number) => number !== item.number)); }} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.item_name}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{item.number} · {item.item_group}</span></span>
              <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs tabular-nums">{t("bomCreation.componentQty")}: {item.qty}</span>
            </label>)}
          </div>
          {packageError && <p role="alert" className="text-destructive">{packageError}</p>}
        </div>
      </AppModal>}
    </FormSection>}
    <FormSection title={t("bomCreation.choose")} description={t("bomCreation.help")}>
      <div role="radiogroup" aria-label={t("bomCreation.choose")} className="grid gap-3 md:grid-cols-3">
        {options.map(({ key, icon }) => <label key={key} className={`flex cursor-pointer gap-3 border p-4 ${mode === key ? "border-primary bg-primary/5" : "border-border"}`}>
          <input type="radio" name="bom-creation" value={key} checked={mode === key} onChange={() => { setMode(key); setSource(""); }} className="mt-1 accent-primary" />
          <span className="min-w-0">{createElement(icon, { className: "mb-2 size-5 text-primary" })}<span className="block text-sm font-semibold">{t(`bomCreation.${key}`)}</span><span className="mt-1 block text-xs text-muted-foreground">{t(`bomCreation.${key}Help`)}</span></span>
        </label>)}
      </div>
      {mode !== "fresh" && <div className="mt-5 max-w-xl"><FormField label={t(mode === "template" ? "bomCreation.template" : "bomCreation.source")} required hint={t(mode === "template" ? "bomCreation.templateHint" : "bomCreation.copyHint")}>
        <LinkField key={mode} doctype={mode === "template" ? "UI BOM Template" : "BOM"} value={source} onChange={setSource} disabled={!company} filters={mode === "template" ? { company, enabled: 1 } : { company, docstatus: ["!=", 2] }} />
      </FormField></div>}
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate("/projects/UI BOM Template")}>{t("bomCreation.manageTemplates")}</Button><Button variant="outline" disabled={!company} onClick={() => navigate("/projects/UI BOM Template/new", { state: { manufacturingCompany: company } })}>{t("bomCreation.newTemplate")}</Button></div>
      <div className="mt-5 flex justify-end"><Button onClick={start} disabled={!company || !!error || (mode !== "fresh" && !source)}>{t("bomCreation.continue")}</Button></div>
    </FormSection>
  </DashboardShell>;
}
