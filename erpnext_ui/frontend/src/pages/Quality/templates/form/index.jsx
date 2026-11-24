import { useEffect, useRef, useState } from "react";
import { ClipboardList, ListChecks, Pencil, Trash2 } from "lucide-react";
import { get } from "../../../../services/api";
import { saveDocument } from "../../../../lib/docTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import LinkField from "../../../../components/LinkField";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import { focusFirstError } from "../../../../lib/formValidation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import AppModal from "../../../../components/AppModal";
import ResponseConfigEditor from "../../components/ResponseConfigEditor";
import {
  defaultResponseConfig,
  formulaExampleKey,
  formulaForChoices,
  formulaHintKey,
  formulaUnknownVariables,
  formulaWarningKey,
  isFormulaResponse,
  isNumericResponse,
  parseResponseConfig,
  serializeResponseConfig,
} from "../../../../lib/qualityResponse";



export default function QualityTemplateForm() {
  const navigate = useNavigate();
  const { name } = useParams();
  const { setHeader, setShellMode } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [activeTab, setActiveTab] = useState("details");
  const [editingRow, setEditingRow] = useState(null);

  useEffect(() => {
    setShellMode?.("tabbed-form");
    return () => setShellMode?.("default");
  }, [setShellMode]);

  const [doc, setDoc] = useState({
    quality_inspection_template_name: "",
    item_quality_inspection_parameter: [],
  });

  // Always points at the newest document. The Save button is registered into
  // the page toolbar by an effect that deliberately does not depend on `doc`
  // (re-running it per keystroke would thrash the toolbar), so the registered
  // handler closes over the document as of an early render -- validation and
  // the saved payload then used stale data. Handlers read through this ref.
  const docRef = useRef(doc);

  // Synced in an effect, not during render: the React Compiler lint rule
  // forbids mutating a ref while rendering. Handlers run after a commit.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);


  /* ================= LOAD ================= */

  const mapRowFromERP = (r) => ({
    ...r,
    responseConfig: parseResponseConfig(r.custom_response_config, r),
  });

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Quality Inspection Template/${name}`);
      const data = res.data;

      setDoc({
        ...data,
        quality_inspection_template_name:
          data.quality_inspection_template_name || "",
        item_quality_inspection_parameter: (
          data.item_quality_inspection_parameter || []
        ).map(mapRowFromERP),
      });
    } catch (e) {
      console.error(e);
      toast.error(t("quality.loadFailedTemplate"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= ROW ================= */

  const addRow = () => {
    setEditingRow(doc.item_quality_inspection_parameter.length);
    setDoc((prev) => ({
      ...prev,
      item_quality_inspection_parameter: [
        ...prev.item_quality_inspection_parameter,
        {
          specification: "",
          responseConfig: defaultResponseConfig(),
          value: "",
          min_value: "",
          max_value: "",
          acceptance_formula: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    setDoc((current) => {
      const rows = current.item_quality_inspection_parameter.map((row, index) =>
        index === i ? { ...row, [field]: value } : row,
      );
      if (field === "responseConfig") {
        rows[i] = {
          ...rows[i],
          value: "",
          min_value: "",
          max_value: "",
          acceptance_formula: "",
        };
      }
      return { ...current, item_quality_inspection_parameter: rows };
    });
  };

  const removeRow = (i) => {
    setDoc({
      ...doc,
      item_quality_inspection_parameter:
        doc.item_quality_inspection_parameter.filter((_, idx) => idx !== i),
    });
  };

  /* ================= SAVE ================= */

  const preparePayload = (d = docRef.current) => {
    return {
      quality_inspection_template_name: d.quality_inspection_template_name,
      item_quality_inspection_parameter:
        d.item_quality_inspection_parameter.map((r) => {
          const config = parseResponseConfig(r.responseConfig, r);
          let row = {
            doctype: "Item Quality Inspection Parameter",
            specification: r.specification,
            custom_response_config: serializeResponseConfig(config),
          };

          if (config.type === "numeric_range") {
            row.numeric = 1;
            row.min_value = r.min_value;
            row.max_value = r.max_value;
          }

          if (config.type === "exact_value") {
            row.numeric = 0;
            row.value = r.value;
          }

          if (["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config.type)) {
            row.numeric = 0;
            row.formula_based_criteria = 1;
            row.acceptance_formula = formulaForChoices(config);
          }

          if (config.type === "free_text") {
            row.numeric = 0;
            row.value = "";
          }

          if (isFormulaResponse(config)) {
            row.numeric = isNumericResponse(config) ? 1 : 0;
            row.formula_based_criteria = 1;
            row.acceptance_formula = r.acceptance_formula;
          }

          return row;
        }),
    };
  };

  const handleSave = async () => {
    const current = docRef.current;
    const errs = {};

    if (!current.quality_inspection_template_name) {
      errs.quality_inspection_template_name = t(
        "quality.templateNameRequired",
      );
    }
    if (!current.item_quality_inspection_parameter.length) {
      errs.item_quality_inspection_parameter = t(
        "quality.addOneParameter",
      );
    }
    for (const row of current.item_quality_inspection_parameter) {
      const config = parseResponseConfig(row.responseConfig, row);
      if (!row.specification) {
        errs.item_quality_inspection_parameter = t("quality.parameterRequired");
        break;
      }
      if (config.type === "numeric_range") {
        const min = Number(row.min_value);
        const max = Number(row.max_value);
        if (row.min_value === "" || row.max_value === "" || !Number.isFinite(min) || !Number.isFinite(max) || min > max) {
          errs.item_quality_inspection_parameter = t("quality.validRangeRequired");
          break;
        }
      }
      if (config.type === "exact_value" && !String(row.value || "").trim()) {
        errs.item_quality_inspection_parameter = t("quality.expectedValueRequired");
        break;
      }
      if (isFormulaResponse(config) && !String(row.acceptance_formula || "").trim()) {
        errs.item_quality_inspection_parameter = t("quality.formulaRequired");
        break;
      }
      if (config.type === "choices") {
        const choices = (config.choices || []).filter((choice) => choice.value.trim());
        if (!choices.length) {
          errs.item_quality_inspection_parameter = t("quality.choiceRequired");
          break;
        }
        if (!choices.some((choice) => choice.result === "Accepted")) {
          errs.item_quality_inspection_parameter = t("quality.acceptedChoiceRequired");
          break;
        }
      }
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setActiveTab(errs.quality_inspection_template_name ? "details" : "parameters");
      // The banner states the SITUATION; the field carries the message. Both
      // are on screen at once here, so repeating the sentence says it twice.
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }

    try {
      setLoading(true);

      const payload = preparePayload();

      await saveDocument({
        doctype: "Quality Inspection Template",
        name: name || undefined,
        doc: payload,
      });

      toast.success(t("quality.savedSuccess"));
      // The list is /quality/templates; /quality-templates was never registered, so
      // this redirected into the catch-all and looked like a dead app.
      navigate("/quality/templates");
    } catch (e) {
      console.error(e);
      toast.error(t("quality.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: name
        ? t("quality.templateTitle", { name: doc.name || "" })
        : t("quality.newTemplate"),

      subtitle: name
        ? t("quality.templateEditSubtitle")
        : t("quality.templateNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.templatesBreadcrumb"), path: "/quality/templates" },
        {
          label: name ? doc.name || t("common.edit") : t("common.new"),
        },
      ],

      actions: [
        {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
          disabled: loading,
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, loading, doc]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    if (name) {
      // loadDoc only setStates after awaited API responses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= UI ================= */

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col">
    <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1 gap-0 overflow-hidden bg-card">
      <TabsList className="h-auto w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-card p-0">
        {[ ["details", t("quality.basicInfo")], ["parameters", t("quality.inspectionParameters")], ["metadata", t("common.metadata")] ].map(([id, label]) => <TabsTrigger key={id} value={id} className="min-h-9 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1 text-xs text-muted-foreground shadow-none after:hidden data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{label}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="details" className="m-0 min-h-0 overflow-y-auto p-0">

      {/* BASIC */}
      <FormSection title={t("quality.basicInfo")} icon={ClipboardList}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label={t("quality.templateName")}
            required
            name="quality_inspection_template_name"
            error={fieldErrors.quality_inspection_template_name}
          >
            <Input
              value={doc.quality_inspection_template_name}
              onChange={(e) =>
                setDoc({
                  ...doc,
                  quality_inspection_template_name: e.target.value,
                })
              }
            />
          </FormField>
        </div>
      </FormSection>
      </TabsContent>

      {/* PARAMETERS */}
      <TabsContent value="parameters" className="m-0 min-h-0 overflow-y-auto p-0">
      <FormSection
        title={t("quality.inspectionParameters")}
        icon={ListChecks}
        action={
          <Button size="sm" onClick={addRow}>
            + {t("quality.add")}
          </Button>
        }
        contentClassName="flex flex-col gap-3"
      >
        <FormField
          name="item_quality_inspection_parameter"
          error={fieldErrors.item_quality_inspection_parameter}
          className={
            fieldErrors.item_quality_inspection_parameter ? "" : "sr-only"
          }
        >
          <span className="sr-only">{t("quality.inspectionParameters")}</span>
        </FormField>

        <Table containerClassName="max-h-[min(60dvh,40rem)] overflow-auto" containerProps={{ role: "region", "aria-label": t("quality.inspectionParameters"), tabIndex: 0 }}>
          <TableHeader className="sticky top-0 z-10 bg-table-header"><TableRow><TableHead>#</TableHead><TableHead>{t("quality.parameter")}</TableHead><TableHead>{t("quality.responseType")}</TableHead><TableHead className="text-end">{t("common.actions")}</TableHead></TableRow></TableHeader>
          <TableBody>{doc.item_quality_inspection_parameter.map((row, idx) => <TableRow key={idx}><TableCell>{idx + 1}</TableCell><TableCell>{row.specification || "—"}</TableCell><TableCell>{t(`quality.responseTypes.${row.responseConfig?.type || "numeric_range"}`)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("common.edit")} · ${t("common.row", { n: idx + 1 })}`} onClick={() => setEditingRow(idx)}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={`${t("common.delete")} · ${t("common.row", { n: idx + 1 })}`} onClick={() => removeRow(idx)}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody>
        </Table>
        <AppModal show={editingRow != null} onClose={() => setEditingRow(null)} title={t("quality.parameter")} width="lg" footer={<Button type="button" variant="outline" onClick={() => setEditingRow(null)}>{t("common.close")}</Button>}>
        {doc.item_quality_inspection_parameter.map((row, idx) => idx === editingRow && (
          <div key={idx} className="p-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* PARAM */}
              <FormField label={t("quality.parameter")} required>
                <LinkField
                  doctype="Quality Inspection Parameter"
                  value={row.specification}
                  onChange={async (v) => {
                    updateRow(idx, "specification", v);
                    if (!v) return;
                    try {
                      const result = await get(`resource/Quality Inspection Parameter/${encodeURIComponent(v)}`);
                      const masterConfig = parseResponseConfig(result.data?.custom_response_config);
                      updateRow(idx, "responseConfig", masterConfig);
                    } catch {
                      // Older sites may not have migrated the response field yet.
                    }
                  }}
                />
              </FormField>

              <div className="md:col-span-2">
                <ResponseConfigEditor
                  value={row.responseConfig}
                  onChange={(responseConfig) => updateRow(idx, "responseConfig", responseConfig)}
                />
              </div>

            </div>

            {/* VALUE INPUTS */}
            <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
              {row.responseConfig?.type === "numeric_range" && (
                <>
                  <FormField label={t("quality.min")}>
                    <Input
                      value={row.min_value || ""}
                      onChange={(e) =>
                        updateRow(idx, "min_value", e.target.value)
                      }
                    />
                  </FormField>

                  <FormField label={t("quality.max")}>
                    <Input
                      value={row.max_value || ""}
                      onChange={(e) =>
                        updateRow(idx, "max_value", e.target.value)
                      }
                    />
                  </FormField>
                </>
              )}

              {row.responseConfig?.type === "exact_value" && (
                <FormField label={t("quality.value")}>
                  <Input
                    value={row.value || ""}
                    onChange={(e) => updateRow(idx, "value", e.target.value)}
                  />
                </FormField>
              )}

              {isFormulaResponse(row.responseConfig) && (
                <div className="md:col-span-2 space-y-2">
                  <FormField
                    label={t("quality.formula")}
                    // The field is a bare Python expression, and the
                    // variables it may use are NOT the obvious ones: the
                    // numeric and the text formula see DISJOINT sets of
                    // names (lib/qualityResponse.js -> formulaVariables).
                    // Without this, the only way to find out is to save a
                    // template and then fail an inspection with "reading_1
                    // is not a valid reading field".
                    hint={
                      formulaHintKey(row.responseConfig?.type)
                        ? t(formulaHintKey(row.responseConfig?.type))
                        : undefined
                    }
                  >
                    <Textarea
                      rows={3}
                      className="font-mono"
                      value={row.acceptance_formula || ""}
                      onChange={(e) =>
                        updateRow(idx, "acceptance_formula", e.target.value)
                      }
                      placeholder={
                        formulaExampleKey(row.responseConfig?.type)
                          ? t(formulaExampleKey(row.responseConfig?.type))
                          : undefined
                      }
                    />
                  </FormField>

                  {formulaExampleKey(row.responseConfig?.type) && (
                    <p className="text-xs text-muted-foreground">
                      {t("quality.formulaExample")}{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono">
                        {t(formulaExampleKey(row.responseConfig?.type))}
                      </code>
                    </p>
                  )}

                  {formulaUnknownVariables(
                    row.responseConfig?.type,
                    row.acceptance_formula,
                  ).length > 0 && (
                    <p
                      role="alert"
                      className="text-xs font-medium text-destructive"
                    >
                      {t(formulaWarningKey(row.responseConfig?.type), {
                        names: formulaUnknownVariables(
                          row.responseConfig?.type,
                          row.acceptance_formula,
                        ).join(", "),
                      })}
                    </p>
                  )}
                </div>
              )}

              {row.responseConfig?.type === "free_text" && (
                <p className="text-sm text-muted-foreground md:col-span-2">
                  {t("quality.freeTextTemplateHint")}
                </p>
              )}
            </div>
          </div>
        ))}
        </AppModal>
      </FormSection>
      </TabsContent>
      <TabsContent value="metadata" className="m-0 min-h-0 overflow-y-auto p-0"><dl className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{[[t("common.id"), doc.name], [t("common.created"), doc.creation], [t("common.modified"), doc.modified], [t("common.owner"), doc.owner]].map(([label, value]) => <div key={label}><dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}</dl></TabsContent>
    </Tabs>
    </div>
  );
}
