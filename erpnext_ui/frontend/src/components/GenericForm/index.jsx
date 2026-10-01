import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Link2,
  Paperclip,
  Table2,
  User,
} from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import { useToast } from "../../context/ToastContext";
import { get, post, put } from "../../services/api";
import { FormField } from "../FormField";
import FormSection from "../FormSection";
import ChildTable from "../ChildTable";
import FormErrorSummary from "../FormErrorSummary";
import FormStepper from "../FormStepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  countErrors,
  focusFirstError,
  validateRequired,
} from "../../lib/formValidation";
import {
  buildLayoutTree,
  resolveLayoutMode,
  buildSteps,
  sectionFieldNames,
  findGroupIndexForField,
} from "./buildLayout";
import { getFieldRenderer } from "./fieldTypes";
import { getDoctypeConfig } from "../../config/doctypes";
import { Spinner } from "@/components/ui/spinner";

/** Extract the hub name from the first segment of the current path. */
function useHub() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

const SYSTEM_FIELDS = [
  "name", "owner", "creation", "modified", "modified_by",
  "idx", "docstatus", "amended_from", "amended_by",
  "_user_tags", "_comments", "_assign", "_liked_by",
  "doctype",
];

/** Pick a section header icon from the dominant field type in the section. */
function sectionIcon(section) {
  const fields = section?.fields || [];
  if (fields.some((f) => f.fieldtype === "Table")) return Table2;
  if (fields.some((f) => f.fieldtype === "Attach" || f.fieldtype === "Attach Image"))
    return Paperclip;
  if (fields.some((f) => f.fieldtype === "Date" || f.fieldtype === "Datetime"))
    return CalendarDays;
  if (fields.some((f) => f.fieldtype === "Link")) return Link2;
  if (fields.some((f) => /name|owner|employee|user/i.test(f.fieldname || "")))
    return User;
  return ClipboardList;
}

/* ===============================
   GENERIC FORM
   Adaptive layout: single | tabs | stepper
=============================== */
export default function GenericFormPage() {
  const { doctype, name } = useParams();
  const hub = useHub();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const [meta, setMeta] = useState(null);
  const [childMeta, setChildMeta] = useState({});
  const [doc, setDoc] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState("");
  // Section keys the user manually expanded (errors always force-expand via FormSection).
  // value: true = force open, false = force collapsed, undefined = auto default
  const [sectionOpenOverrides, setSectionOpenOverrides] = useState({});
  const calculateTimer = useRef(null);

  // Adaptive layout state
  const [activeTab, setActiveTab] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);

  const isNew = name === "new" || !name;
  const decodedDoctype = decodeURIComponent(doctype);
  const decodedName = isNew ? null : decodeURIComponent(name);

  const doctypeConfig = useMemo(
    () => getDoctypeConfig(decodedDoctype),
    [decodedDoctype],
  );

  const layoutMode = useMemo(
    () =>
      meta
        ? resolveLayoutMode(meta, doctypeConfig?.form?.layout)
        : "single",
    [meta, doctypeConfig],
  );

  const tabsTree = useMemo(() => (meta ? buildLayoutTree(meta) : []), [meta]);

  const steps = useMemo(
    () => (layoutMode === "stepper" ? buildSteps(tabsTree) : []),
    [layoutMode, tabsTree],
  );

  const isReadOnly =
    (doc.docstatus ?? 0) >= 1 || Boolean(doctypeConfig?.readOnly);

  /* ===============================
     FIELD CHANGE
  ============================== */
  const handleFieldChange = async (fieldname, value) => {
    if (isReadOnly) return;
    setDoc((prev) => ({ ...prev, [fieldname]: value }));
    if (errors[fieldname]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldname];
        return next;
      });
    }

    // fetch_from auto-population
    if (meta && value) {
      const changedField = meta.find((f) => f.fieldname === fieldname);
      if (changedField?.fieldtype === "Link" && changedField.options) {
        const dependentFields = meta.filter(
          (f) => f.fetch_from && f.fetch_from.startsWith(fieldname + "."),
        );
        if (dependentFields.length > 0) {
          try {
            const res = await get(
              `resource/${changedField.options}/${encodeURIComponent(value)}`,
            );
            const linkedData = res.data || {};
            const updates = {};
            dependentFields.forEach((f) => {
              const sourceKey = f.fetch_from.split(".").slice(1).join(".");
              if (linkedData[sourceKey] !== undefined) {
                updates[f.fieldname] = linkedData[sourceKey];
              }
            });
            if (Object.keys(updates).length > 0) {
              setDoc((prev) => ({ ...prev, ...updates }));
            }
          } catch (e) {
            console.warn("fetch_from failed for ", fieldname, e);
          }
        }
      }
    }

    // Debounced server-side calculation (only for doctypes with tables)
    if (meta?.some((f) => f.fieldtype === "Table")) {
      if (calculateTimer.current) clearTimeout(calculateTimer.current);
      calculateTimer.current = setTimeout(() => {
        calculateServerSide();
      }, 1500);
    }
  };

  /* ===============================
     SERVER-SIDE CALCULATION
  ============================== */
  const calculateServerSide = async () => {
    if (isReadOnly) return;
    if (!meta?.some((f) => f.fieldtype === "Table")) return;

    try {
      const payload = { ...doc, doctype: decodedDoctype };
      SYSTEM_FIELDS.forEach((f) => delete payload[f]);
      const res = await post("method/frappe.client.validate", { doc: payload });
      const result = res.message || res.data;
      if (result) {
        setDoc((prev) => ({
          ...prev,
          total_qty: result.total_qty,
          total: result.total,
          net_total: result.net_total,
          total_taxes_and_charges: result.total_taxes_and_charges,
          grand_total: result.grand_total,
          rounded_total: result.rounded_total,
          in_words: result.in_words,
        }));
      }
    } catch (e) {
      console.warn("Server-side calculation failed:", e);
    }
  };

  /* ===============================
     VALIDATION
  ============================== */
  /** Jump to the tab/step that owns the first validation error. */
  const jumpToFirstErrorField = (errorMap) => {
    const firstField = Object.keys(errorMap).find((k) => errorMap[k]);
    if (!firstField) return;

    if (layoutMode === "stepper" && steps.length) {
      const idx = findGroupIndexForField(steps, firstField);
      setActiveStep(idx);
      setMaxReached((m) => Math.max(m, idx));
    } else if (layoutMode === "tabs" && tabsTree.length > 1) {
      const idx = findGroupIndexForField(tabsTree, firstField);
      setActiveTab(idx);
    }
  };

  const applyErrors = (newErrors) => {
    setErrors(newErrors);
    const list = Object.values(newErrors).filter(Boolean);
    const valid = list.length === 0;
    const msg =
      list.length === 0
        ? ""
        : list.length > 1
          ? t("common.fixErrors")
          : list[0];
    setSummary(msg);
    if (!valid) {
      jumpToFirstErrorField(newErrors);
      toast.error(msg || t("common.fixToContinue"));
      requestAnimationFrame(() => focusFirstError(newErrors));
    }
    return valid;
  };

  /** Validate one stepper step; returns true when the step is complete. */
  const validateStep = (stepIndex) => {
    const step = steps[stepIndex];
    if (!step) return true;
    const stepErrors = validateRequired(doc, step.fields, t);

    // Merge: clear previous errors on this step's fields, keep other steps'
    setErrors((prev) => {
      const next = { ...prev };
      const stepNames = new Set(step.fields.map((f) => f.fieldname));
      Object.keys(next).forEach((k) => {
        if (stepNames.has(k)) delete next[k];
      });
      Object.assign(next, stepErrors);
      return next;
    });

    const ok = Object.keys(stepErrors).length === 0;
    if (!ok) {
      const msg =
        Object.keys(stepErrors).length > 1
          ? t("common.fixErrors")
          : Object.values(stepErrors)[0];
      setSummary(msg);
      jumpToFirstErrorField(stepErrors);
      toast.error(msg || t("common.fixToContinue"));
      requestAnimationFrame(() => focusFirstError(stepErrors));
    } else {
      setSummary("");
    }
    return ok;
  };

  /** Full-form validate that also navigates to the failing group. */
  const validateAllAndJump = () => {
    if (!meta) return true;
    const newErrors = validateRequired(doc, meta, t);
    return applyErrors(newErrors);
  };

  /* ===============================
     SAVE / SUBMIT / DELETE
  ============================== */
  const handleSave = async () => {
    if (isReadOnly) return;
    if (!validateAllAndJump()) return;
    setSaving(true);

    try {
      const payload = { ...doc };
      SYSTEM_FIELDS.forEach((f) => delete payload[f]);
      payload.doctype = decodedDoctype;

      if (isNew) {
        await post(`resource/${decodedDoctype}`, payload);
        toast.success(t("common.createdSuccess", { name: decodedDoctype }));
      } else {
        await put(
          `resource/${decodedDoctype}/${decodedName}`,
          payload,
        );
        toast.success(t("common.updatedSuccess", { name: decodedDoctype }));
      }

      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Save failed:", e);
      toast.error(e.message || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (docName) => {
    if (!validateAllAndJump()) return;
    setSaving(true);
    try {
      await get("method/frappe.client.submit", {
        doctype: decodedDoctype,
        name: docName,
      });
      toast.success(t("common.submittedSuccess", { name: decodedDoctype }));
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Submit failed:", e);
      toast.error(e.message || t("common.submitFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docName) => {
    if (
      !window.confirm(t("common.deleteConfirm", { name: decodedDoctype }))
    )
      return;

    setSaving(true);
    try {
      await get("method/frappe.client.delete", {
        doctype: decodedDoctype,
        name: docName,
      });
      toast.success(t("common.deletedSuccess", { name: decodedDoctype }));
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error(e.message || t("common.deleteFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* ===============================
     STEP NAVIGATION
  ============================== */
  const handleNext = () => {
    if (activeStep >= steps.length - 1) return;
    if (!validateStep(activeStep)) return;
    const next = activeStep + 1;
    setActiveStep(next);
    setMaxReached((m) => Math.max(m, next));
    setSummary("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (activeStep <= 0) return;
    setActiveStep(activeStep - 1);
    setSummary("");
  };

  const handleStepSelect = (idx) => {
    if (idx > maxReached) return;
    setActiveStep(idx);
    setSummary("");
  };

  /* ===============================
     NATIVE FORM REDIRECT
  ============================== */
  useEffect(() => {
    const cfg = getDoctypeConfig(decodedDoctype);
    if (cfg.nativeForm) {
      const doctypeUrl = decodedDoctype.toLowerCase().replace(/\s+/g, "-");
      const url = isNew
        ? `/app/${doctypeUrl}/new-${doctypeUrl}`
        : `/app/${doctypeUrl}/${decodedName}`;
      window.open(url, "_blank");
      navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
     LOAD METADATA + DOC
  ============================== */
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const metaRes = await get(`resource/DocType/${decodedDoctype}`);
        const fields = metaRes.data?.fields || [];
        setMeta(fields);

        const childMetaCache = {};
        const tableFields = fields.filter(
          (f) => f.fieldtype === "Table" && f.options,
        );
        await Promise.all(
          tableFields.map(async (tf) => {
            try {
              const childRes = await get(`resource/DocType/${tf.options}`);
              childMetaCache[tf.options] = childRes.data?.fields || [];
            } catch {
              childMetaCache[tf.options] = [];
            }
          }),
        );
        setChildMeta(childMetaCache);

        const initialDoc = {};
        fields.forEach((f) => {
          if (
            SYSTEM_FIELDS.includes(f.fieldname) ||
            ["Section Break", "Column Break", "Tab Break", "Fold", "Page Break"].includes(
              f.fieldtype,
            )
          )
            return;
          if (f.default && !isNew) return;
          if (f.default) {
            initialDoc[f.fieldname] = f.default;
          } else if (f.fieldtype === "Check") {
            initialDoc[f.fieldname] = 0;
          } else if (f.fieldtype === "Table") {
            initialDoc[f.fieldname] = [];
          } else {
            initialDoc[f.fieldname] = null;
          }
        });

        if (!isNew && decodedName) {
          const docRes = await get(
            `resource/${decodedDoctype}/${decodedName}`,
          );
          const docData = docRes.data || {};
          Object.keys(initialDoc).forEach((key) => {
            if (docData[key] !== undefined) {
              initialDoc[key] = docData[key];
            }
          });
          initialDoc.name = docData.name;
          initialDoc.docstatus = docData.docstatus;
        }

        setDoc(initialDoc);
        setActiveTab(0);
        setActiveStep(0);
        setMaxReached(0);
        setSectionOpenOverrides({});
      } catch (e) {
        console.error("Failed to load form:", e);
        toast.error(t("common.failedToLoad", { name: decodedDoctype }));
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, name]);

  /* ===============================
     HEADER + BOTTOM TOOLBAR ACTIONS
  ============================== */
  useEffect(() => {
    const hubName = hub ? hub.charAt(0).toUpperCase() + hub.slice(1) : "";
    const isStepper = layoutMode === "stepper" && steps.length > 1;
    const canGoBack = isStepper && activeStep > 0;
    const canGoNext = isStepper && activeStep < steps.length - 1;

    const actions = [];

    if (canGoBack) {
      actions.push({
        label: t("common.back"),
        variant: "btn-outline-primary",
        disabled: saving || loading,
        onClick: handleBack,
      });
    }
    if (canGoNext) {
      actions.push({
        label: t("common.next"),
        variant: "btn-outline-primary",
        disabled: saving || loading,
        onClick: handleNext,
      });
    }

    if (!isReadOnly) {
      actions.push({
        label: saving ? t("common.saving") : t("common.save"),
        variant: "btn-success",
        disabled: saving || loading,
        onClick: handleSave,
      });
    }

    if (!isNew && doc.docstatus === 0 && !isReadOnly) {
      actions.push({
        label: t("common.submit"),
        variant: "btn-primary",
        disabled: saving || loading,
        onClick: () => handleSubmit(doc.name),
      });
      actions.push({
        label: t("common.delete"),
        variant: "btn-outline-danger",
        disabled: saving || loading,
        onClick: () => handleDelete(doc.name),
      });
    }

    const errorCount = countErrors(errors);
    const focusFirstErr = () => {
      requestAnimationFrame(() => focusFirstError(errors));
    };

    setHeader({
      title: isNew
        ? t("common.createNew", { name: decodedDoctype })
        : `${doc.name || decodedDoctype}`,
      subtitle: isNew
        ? t("common.createNew", { name: decodedDoctype })
        : t("common.editing", { name: decodedDoctype }),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: hubName, path: `/${hub}` },
        {
          label: decodedDoctype,
          path: `/${hub}/${encodeURIComponent(decodedDoctype)}`,
        },
        { label: isNew ? t("common.new") : doc.name || "" },
      ],
      actions,
      errorCount,
      onErrorsClick: errorCount > 0 ? focusFirstErr : undefined,
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    doctype,
    name,
    hub,
    doc,
    loading,
    saving,
    layoutMode,
    activeStep,
    steps.length,
    isReadOnly,
    t,
    errors,
  ]);

  /* ===============================
     RENDER HELPERS
  ============================== */
  const renderField = (field) => {
    const Renderer = getFieldRenderer(field.fieldtype);
    return (
      <Renderer
        key={field.fieldname}
        field={field}
        value={doc[field.fieldname]}
        onChange={(val) => handleFieldChange(field.fieldname, val)}
        error={errors[field.fieldname]}
        disabled={isReadOnly}
      />
    );
  };

  const renderSectionFields = (fields) => {
    const rows = [];
    let currentRow = [];

    fields.forEach((field) => {
      const ft = field.fieldtype;

      if (["Section Break", "Column Break", "Tab Break", "Fold", "Page Break"].includes(ft)) {
        if (ft === "Column Break" && currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        return;
      }

      if (ft === "Table") {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        rows.push([field]);
        return;
      }

      currentRow.push(field);
    });

    if (currentRow.length > 0) rows.push(currentRow);

    return (
      <div>
        {rows.map((row, rowIdx) => {
          if (row.length === 1 && row[0].fieldtype === "Table") {
            const cf = row[0];
            const childFields =
              cf.options && childMeta[cf.options] ? childMeta[cf.options] : [];
            return (
              <div key={rowIdx} className="mb-4">
                <ChildTable
                  title={cf.label}
                  columns={childFields
                    .filter(
                      (c) =>
                        c.fieldname &&
                        c.fieldname !== "parent" &&
                        c.fieldname !== "parenttype" &&
                        c.fieldname !== "parentfield" &&
                        c.fieldname !== "idx",
                    )
                    .map((c) => ({
                      field: c.fieldname,
                      label: c.label,
                      type:
                        c.fieldtype === "Check"
                          ? "checkbox"
                          : c.fieldtype === "Select"
                            ? "select"
                            : c.fieldtype === "Int" ||
                                c.fieldtype === "Float" ||
                                c.fieldtype === "Currency"
                              ? "number"
                              : c.fieldtype === "Link"
                                ? "link"
                                : "text",
                      options: c.options,
                      required: c.reqd,
                      fetchFrom: c.fetch_from,
                    }))}
                  value={doc[cf.fieldname] || []}
                  onChange={(val) => handleFieldChange(cf.fieldname, val)}
                  disabled={isReadOnly}
                />
              </div>
            );
          }

          return (
            <div
              key={rowIdx}
              className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-12"
            >
              {row.map((field) => {
                const colClass =
                  row.length >= 3
                    ? "md:col-span-4"
                    : row.length === 2
                      ? "md:col-span-6"
                      : "md:col-span-12";
                if (field.hidden) return null;

                return (
                  <div key={field.fieldname} className={colClass}>
                    {field.fieldtype === "Check" ? (
                      renderField(field)
                    ) : (
                      <FormField
                        label={field.label}
                        required={Boolean(field.reqd) && !isReadOnly}
                        name={field.fieldname}
                        htmlFor={field.fieldname}
                        error={errors[field.fieldname]}
                      >
                        {renderField(field)}
                      </FormField>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const sectionErrorCount = (section) => {
    if (!section?.fields?.length) return 0;
    let n = 0;
    section.fields.forEach((f) => {
      if (f?.fieldname && errors[f.fieldname]) n += 1;
    });
    return n;
  };

  const sectionHasErrors = (section) => sectionErrorCount(section) > 0;

  // Auto: first section open by default when few sections; rest collapsed
  // when >2. Sections with errors always open (FormSection).
  const sectionDefaultOpen = (section, index, total) => {
    if (sectionHasErrors(section)) return true;
    if (total <= 2) return true;
    return index === 0;
  };

  const renderSectionCard = (section, key, sectionIndex = 0, total = 1) => {
    if (!section.fields.length) return null;
    const secKey = key ?? section.label;
    const errorCount = sectionErrorCount(section);
    const hasErr = errorCount > 0;
    const defaultOpen = sectionDefaultOpen(section, sectionIndex, total);
    const override = sectionOpenOverrides[secKey];
    const open = hasErr ? true : override !== undefined ? override : defaultOpen;

    return (
      <FormSection
        key={secKey}
        title={section.label}
        description={section.description}
        icon={sectionIcon(section)}
        className="mb-4"
        collapsible
        defaultOpen={defaultOpen}
        errorCount={errorCount}
        open={open}
        onOpenChange={(next) => {
          setSectionOpenOverrides((prev) => ({ ...prev, [secKey]: next }));
        }}
      >
        {renderSectionFields(section.fields)}
      </FormSection>
    );
  };

  const renderTabsTree = (tabList) => {
    if (!tabList.length) return null;

    if (tabList.length === 1) {
      const sections = tabList[0].sections;
      return sections.map((s, i) =>
        renderSectionCard(s, `${tabList[0].id}-s${i}`, i, sections.length),
      );
    }

    return (
      <Tabs
        value={String(activeTab)}
        onValueChange={(v) => {
          setActiveTab(Number(v));
          setSummary("");
        }}
        className="w-full"
      >
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-1.5 border-b border-border/60 bg-transparent px-1 py-1.5"
        >
          {tabList.map((tab, i) => {
            const names = sectionFieldNames(tab.sections);
            const errCount = names.filter((n) => errors[n]).length;
            return (
              <TabsTrigger
                key={tab.id}
                value={String(i)}
                className="gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:font-semibold hover:text-foreground"
              >
                {tab.label || t("common.tab", { n: i + 1 })}
                {errCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums text-destructive-foreground">
                    {errCount}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {tabList.map((tab, i) => (
          <TabsContent key={tab.id} value={String(i)} className="pt-4">
            {tab.description && (
              <p className="mb-3 text-xs text-muted-foreground">
                {tab.description}
              </p>
            )}
            {tab.sections.map((s, si) =>
              renderSectionCard(
                s,
                `${tab.id}-s${si}`,
                si,
                tab.sections.length,
              ),
            )}
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderStepper = () => {
    if (!steps.length) return null;
    const step = steps[activeStep];

    const errorSteps = steps.map((s, i) =>
      sectionFieldNames(s.sections).some((n) => errors[n]) ? i : -1,
    ).filter((i) => i >= 0);

    return (
      <div className="rounded-none border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]">
        <FormStepper
          steps={steps}
          current={activeStep}
          maxReached={maxReached}
          errorSteps={errorSteps}
          onSelect={handleStepSelect}
        />
        {/* Active-step tinted panel */}
        <div className="bg-primary/[0.03] px-3 pt-4 pb-2 sm:px-4">
          <div className="mb-1 text-sm font-semibold">
            {step.label || t("common.step", { n: activeStep + 1 })}
          </div>
          <div className="mb-3 text-xs text-muted-foreground">
            {step.description ||
              t("common.stepOf", {
                current: activeStep + 1,
                total: steps.length,
              })}
          </div>
          {step.sections.map((s, i) =>
            renderSectionCard(
              s,
              `${step.id}-s${i}`,
              i,
              step.sections.length,
            ),
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-card px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={activeStep === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
            {t("common.back")}
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("common.stepOf", {
              current: activeStep + 1,
              total: steps.length,
            })}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={activeStep >= steps.length - 1}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-[var(--btn-primary-shadow)] transition-all hover:bg-primary/90 hover:shadow-none disabled:pointer-events-none disabled:opacity-40"
          >
            {t("common.next")}
            <ArrowRight className="size-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Spinner className="size-6 text-primary" />
        <div className="text-sm">{t("common.loadingForm")}</div>
      </div>
    );
  }

  let body = null;
  if (layoutMode === "stepper") {
    body = renderStepper();
  } else {
    body = renderTabsTree(tabsTree);
  }

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <FormErrorSummary summary={summary} fieldErrors={errors} className="mb-4" />

      {body}

      {/* Read-only system info for existing docs */}
      {!isNew && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground md:grid-cols-4">
          <div>
            <span className="font-medium">{t("common.id")}:</span> {doc.name}
          </div>
          <div>
            <span className="font-medium">{t("common.created")}:</span>{" "}
            {doc.creation}
          </div>
          <div>
            <span className="font-medium">{t("common.modified")}:</span>{" "}
            {doc.modified}
          </div>
          <div>
            <span className="font-medium">{t("common.owner")}:</span>{" "}
            {doc.owner}
          </div>
        </div>
      )}
    </div>
  );
}
