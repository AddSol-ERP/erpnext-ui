import { inspectionFieldVisible } from "../../pages/Projects/bom/visibility";
import ProjectSalesItemPicker from "../../pages/Projects/bom/ProjectSalesItemPicker";
import { operationsEnabled, routingOperations, operationFieldVisible } from "../../pages/Projects/bom/routing";
import { buildBomLayout, bomTableColumns } from "../../pages/Projects/bom/layout";
import { deskNewUrl, deskDocUrl } from "../../lib/deskUrl";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
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
import { get, post } from "../../services/api";
import {
  deleteDocument,
  getWorkflowActions,
  resolveForwardActions,
  saveDocument,
  submitDocument,
  workflowActionLabelKey,
  hasConfiguredWorkflow,
} from "../../lib/docTransition";
import { useDocStatus } from "../../hooks/useDocStatus";
import { getApprovalMeta } from "../../lib/approvalMeta";
import { FormField } from "../FormField";
import FormSection from "../FormSection";
import ChildTable from "../ChildTable";
import ConfirmDialog from "../ConfirmDialog";
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
  sectionsAsTabs,
  resolveLayoutMode,
  buildSteps,
  sectionFieldNames,
  findGroupIndexForField,
} from "./buildLayout";
import { getFieldRenderer } from "./fieldTypes";
import { getDoctypeConfig } from "../../config/doctypes";
import { plainText, shortenText } from "../../lib/displayText";
import { fetchAttachmentConfig } from "../../lib/attachments";
import { AttachDialog, RequiredAttachmentDialog } from "../Attachments";
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
  const location = useLocation();
  const navigate = useNavigate();
  const { setHeader, setShellMode } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const [meta, setMeta] = useState(null);
  const [childMeta, setChildMeta] = useState({});
  const [doc, setDoc] = useState({});
  const [dirty, setDirty] = useState(false);

  // Always points at the newest document. The Save/Next/Submit buttons are
  // registered into the page toolbar by an effect that deliberately does not
  // depend on `doc` (re-running it on every keystroke would thrash the
  // toolbar). Those captured handlers therefore closed over the document as it
  // looked on an early render, so Save validated and POSTED stale data --
  // silently discarding the user's edits. Every handler must read through this
  // ref instead.
  const docRef = useRef(doc);


  // Synced in an effect rather than during render: the React Compiler lint rule
  // forbids mutating a ref while rendering. The handlers run after a commit
  // (clicks), so the ref is current by then.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState("");
  const [ratesRevision, setRatesRevision] = useState(0);
  const routingRequest = useRef(0);
  useEffect(() => () => { routingRequest.current += 1; }, [doctype, name]);
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [initialAttachment, setInitialAttachment] = useState(null);
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
  const isBomForm = ["BOM", "UI BOM Template"].includes(decodedDoctype);
  const decodedName = isNew ? null : decodeURIComponent(name);

  useEffect(() => {
    let cancelled = false;
    fetchAttachmentConfig(decodedDoctype)
      .then((config) => {
        if (!cancelled) setAttachmentsEnabled(Boolean(config.enabled));
      })
      .catch(() => {
        if (!cancelled) setAttachmentsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [decodedDoctype]);

  // Read-only lifecycle badge for the form header. Must sit after
  // `decodedDoctype` / `decodedName` are declared.
  const status = useDocStatus({ doctype: decodedDoctype, doc });

  /**
   * Unsaved changes hide Submit, mirroring Frappe's `!doc.__unsaved` condition.
   *
   * Tracked from real user input rather than by diffing against the loaded
   * document: effects here also write to `doc` (employee scope defaults, the
   * debounced server-side calculation, auto-filled approvers), and those are
   * not edits. Diffing would report a freshly-opened form as dirty and leave
   * Submit permanently hidden.
   */
  const markDirty = useCallback(() => setDirty(true), []);

  const doctypeConfig = useMemo(
    () => getDoctypeConfig(decodedDoctype),
    [decodedDoctype],
  );

  const explicitLayout = doctypeConfig?.form?.layout;
  const layoutMode = useMemo(() => {
    if (!meta) return "single";
    const resolved = resolveLayoutMode(meta, explicitLayout);
    return !isBomForm && !explicitLayout && sectionsAsTabs(buildLayoutTree(meta)).length > buildLayoutTree(meta).length ? "tabs" : resolved;
  }, [meta, explicitLayout, isBomForm]);

  const tabsTree = useMemo(
    () => meta ? isBomForm ? buildBomLayout(meta, t, { template: decodedDoctype === "UI BOM Template" }) : explicitLayout === "stepper" ? buildLayoutTree(meta) : sectionsAsTabs(buildLayoutTree(meta)) : [],
    [meta, decodedDoctype, isBomForm, explicitLayout, t],
  );

  const hasCompactTabs = tabsTree.length > 0;
  useEffect(() => {
    if (loading || !hasCompactTabs) return undefined;
    setShellMode?.("tabbed-form");
    return () => setShellMode?.("default");
  }, [loading, hasCompactTabs, setShellMode]);

  const steps = useMemo(
    () => (layoutMode === "stepper" ? buildSteps(tabsTree) : []),
    [layoutMode, tabsTree],
  );

  const isReadOnly =
    (doc.docstatus ?? 0) >= 1 || Boolean(doctypeConfig?.readOnly);

  const bomCostKey = JSON.stringify({
    company: doc.company, project: doc.project, currency: doc.currency,
    conversion_rate: doc.conversion_rate, rm_cost_as_per: doc.rm_cost_as_per,
    buying_price_list: doc.buying_price_list,
    set_rate_of_sub_assembly_item_based_on_bom: doc.set_rate_of_sub_assembly_item_based_on_bom,
    items: (doc.items || []).map((row) => [row.item_code, row.qty, row.uom, row.conversion_factor, row.bom_no, row.sourced_by_supplier, row.custom_chargeable_qty]),
  });
  useEffect(() => {
    if (decodedDoctype !== "BOM" || loading || isReadOnly || !dirty) return;
    let active = true;
    const timer = setTimeout(async () => {
      const current = docRef.current;
      setRatesLoading(false);
      if (!current.company || !current.items?.some((row) => row.item_code && Number(row.qty) > 0)) return;
      if (current.rm_cost_as_per === "Price List" && !current.buying_price_list) return;
      setRatesLoading(true);
      setRatesError("");
      try {
        const response = await post("method/erpnext_ui.api.get_bom_material_rates", { doc: { ...current, doctype: "BOM" } });
        if (active) setDoc((prev) => ({ ...prev, items: prev.items.map((row, index) => {
          const priced = response.message?.items?.[index];
          if (!priced || priced.item_code !== row.item_code) return row;
          const updates = {};
          for (const key of ["item_name", "description", "uom", "stock_uom", "conversion_factor", "bom_no", "rate", "amount", "base_rate", "custom_pricing_uom", "custom_rate_per_pricing_uom", "custom_calculated_chargeable_qty"]) {
            if (priced[key] !== undefined) updates[key] = priced[key];
          }
          return { ...row, ...updates };
        }) }));
      } catch (error) { if (active) setRatesError(error.message); }
      finally { if (active) setRatesLoading(false); }
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [bomCostKey, decodedDoctype, loading, isReadOnly, dirty, ratesRevision]);

  /* ===============================
     FIELD CHANGE
  ============================== */
  const handleFieldChange = async (fieldname, value) => {
    if (isReadOnly) return;
    markDirty();
    setDoc((prev) => ({ ...prev, [fieldname]: value }));
    if (errors[fieldname]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldname];
        return next;
      });
    }

    if (isBomForm && ["routing", "with_operations"].includes(fieldname)) {
      const request = ++routingRequest.current;
      const nextDoc = { ...docRef.current, [fieldname]: value };
      if (operationsEnabled(nextDoc) && nextDoc.routing && (fieldname === "routing" || !nextDoc.operations?.length)) {
        setRoutingLoading(true);
        try {
          const res = await get(`resource/Routing/${encodeURIComponent(nextDoc.routing)}`);
          if (!res.data) throw new Error("Routing could not be loaded");
          if (request === routingRequest.current) {
            setDoc((prev) => prev.routing === nextDoc.routing && operationsEnabled(prev)
              ? { ...prev, operations: routingOperations(res.data) } : prev);
          }
        } catch (e) {
          if (request === routingRequest.current) {
            setDoc((prev) => ({ ...prev, routing: null, operations: [] }));
            toast.error(e.message || t("common.failedToLoad", { name: "Routing" }));
          }
        } finally {
          if (request === routingRequest.current) setRoutingLoading(false);
        }
      } else {
        setRoutingLoading(false);
        if (fieldname === "routing" && !value) setDoc((prev) => ({ ...prev, operations: [] }));
      }
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
      setActiveTab(0);
      const idx = findGroupIndexForField(steps, firstField);
      setActiveStep(idx);
      setMaxReached((m) => Math.max(m, idx));
    } else if (tabsTree.length) {
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
    const stepErrors = validateRequired(docRef.current, step.fields, t);

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
    const newErrors = validateRequired(docRef.current, meta, t);
    return applyErrors(newErrors);
  };

  /* ===============================
     SAVE / SUBMIT / DELETE
  ============================== */
  const handleSave = async () => {
    if (isReadOnly || routingLoading || ratesLoading) return;
    if (!validateAllAndJump()) return;
    setSaving(true);

    try {
      const payload = { ...docRef.current };
      SYSTEM_FIELDS.forEach((f) => delete payload[f]);
      payload.doctype = decodedDoctype;

      // One helper decides POST-for-create vs PUT-for-update, so a save can
      // never hit the execute_doc_method route by mistake.
      const saved = await saveDocument({
        doctype: decodedDoctype,
        name: isNew ? undefined : decodedName,
        doc: payload,
        initialAttachment,
      });

      setDirty(false);

      toast.success(
        isNew
          ? t("common.createdSuccess", { name: decodedDoctype })
          : t("common.updatedSuccess", { name: decodedDoctype }),
      );

      if (hub === "projects" && decodedDoctype === "Project" && saved.data?.name) {
        navigate(`/projects/view/${encodeURIComponent(saved.data.name)}`);
      } else if (hub === "projects" && payload.project && ["Production Plan", "Work Order", "Stock Entry"].includes(decodedDoctype)) {
        navigate(`/projects/view/${encodeURIComponent(payload.project)}/manufacturing?step=${decodedDoctype === "Production Plan" ? "plans" : "orders"}`);
      } else if (hub === "projects" && payload.project) {
        navigate(`/projects/view/${encodeURIComponent(payload.project)}`);
      } else {
        navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
      }
    } catch (e) {
      console.error("Save failed:", e);
      toast.error(e.message || t("common.saveFailed"));
      if (e.savedDocName) {
        navigate(
          `/${hub}/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(e.savedDocName)}`,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * Workflow transitions available on this document right now.
   *
   * `get_transitions` returns [] for an unsaved document, so a new form simply
   * has none and falls through to the ordinary Submit.
   */
  const [transitions, setTransitions] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hasWorkflow, setHasWorkflow] = useState(false);
  const [workflowChecked, setWorkflowChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [meta, configuredWorkflow] = await Promise.all([
        getApprovalMeta(decodedDoctype),
        hasConfiguredWorkflow(decodedDoctype),
      ]);
      if (cancelled) return;
      setHasWorkflow(Boolean(configuredWorkflow ?? meta?.hasWorkflow));
      // Until this resolves we cannot tell a Workflow doctype from a plain one,
      // and offering Submit on a Workflow doctype would bypass its first state.
      setWorkflowChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [decodedDoctype]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { actions } = decodedName
        ? await getWorkflowActions({
            doc: { doctype: decodedDoctype, name: decodedName },
          })
        : { actions: [] };

      if (!cancelled) setTransitions(actions);
    })();

    return () => {
      cancelled = true;
    };
  }, [decodedDoctype, decodedName]);

  /** Apply one Workflow transition, or a plain submit when action is null. */
  const handleSubmit = async (docName, action = null) => {
    if (!validateAllAndJump()) return;
    setSaving(true);
    try {
      // `frappe.client.submit` takes the whole document, and a Workflow has to
      // be driven through `apply_workflow` so the state actually advances.
      await submitDocument({
        doctype: decodedDoctype,
        name: docName,
        action,
      });

      const labelKey = action ? workflowActionLabelKey(action) : null;
      toast.success(
        t("common.submittedSuccess", {
          name: labelKey ? t(labelKey) : action || decodedDoctype,
        }),
      );
      const project = docRef.current.project;
      if (hub === "projects" && project && ["Production Plan", "Work Order", "Stock Entry"].includes(decodedDoctype)) {
        navigate(`/projects/view/${encodeURIComponent(project)}/manufacturing?step=${decodedDoctype === "Production Plan" ? "plans" : "orders"}`);
      } else if (hub === "projects" && project) {
        navigate(`/projects/view/${encodeURIComponent(project)}`);
      } else {
        navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}`);
      }
    } catch (e) {
      console.error("Submit failed:", e);
      toast.error(e.message || t("common.submitFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docName) => {
    setSaving(true);
    try {
      await deleteDocument({ doctype: decodedDoctype, name: docName });
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
      window.open(
        isNew ? deskNewUrl(decodedDoctype) : deskDocUrl(decodedDoctype, decodedName),
        "_blank",
      );
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
        let bomMeta = null;
        if (decodedDoctype === "BOM") {
          try {
            const response = await get("method/addsol_devoltrans_custom.api.design_package.bom_form_metadata");
            bomMeta = response.message;
          } catch (error) {
            if (error.status !== 404 && error.status !== 417) throw error;
          }
        }
        const fields = bomMeta?.BOM?.fields || metaRes.data?.fields || [];
        setMeta(fields);

        const childMetaCache = {};
        const tableFields = fields.filter(
          (f) => f.fieldtype === "Table" && f.options,
        );
        await Promise.all(
          tableFields.map(async (tf) => {
            try {
              if (tf.options === "BOM Item" && bomMeta?.["BOM Item"]) {
                childMetaCache[tf.options] = bomMeta["BOM Item"].fields || [];
                return;
              }
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
          // Keep every metadata field available for hydration on edit. Defaults
          // initialize new documents; saved values (including 0/null) own edits.
          if (isNew && f.default) {
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

        if (isNew && hub === "projects" && decodedDoctype === "Project") {
          initialDoc.is_active = initialDoc.is_active || "Yes";
        }
        if (isNew && decodedDoctype === "UI BOM Template" && location.state?.manufacturingCompany) {
          initialDoc.company = location.state.manufacturingCompany;
        }
        if (isNew && decodedDoctype === "BOM" && location.state?.bomSource) {
          const response = await get("method/erpnext_ui.api.get_project_bom_draft", {
            project: location.state.manufacturingProject,
            source_bom: location.state.bomSource,
            source_type: location.state.bomSourceType || "BOM",
          });
          const draft = response.message;
          if (!draft) throw new Error("BOM draft could not be loaded");
          Object.keys(initialDoc).forEach((key) => {
            if (draft[key] !== undefined) initialDoc[key] = draft[key];
          });
        }
        if (isNew && decodedDoctype === "BOM" && location.state?.manufacturingProject) {
          initialDoc.project = location.state.manufacturingProject;
          initialDoc.company = location.state.manufacturingCompany;
        }
        setDoc(initialDoc);
        setDirty(false);
        setActiveTab(0);
        setActiveStep(0);
        setMaxReached(0);
        setSectionOpenOverrides({});
      } catch (e) {
        console.error("Failed to load form:", e);
        toast.error(t("common.failedToLoad", { name: decodedDoctype }));
        if (isNew && decodedDoctype === "BOM" && location.state?.bomSource) {
          navigate(`/projects/view/${encodeURIComponent(location.state.manufacturingProject)}/bom/create`, { replace: true });
        }
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

    if (attachmentsEnabled) {
      actions.push({
        label: t("attachments.open"),
        variant: "btn-outline-primary",
        disabled: saving || loading,
        onClick: () => setShowAttachments(true),
      });
    }

    if (decodedDoctype === "BOM" && !isReadOnly) {
      actions.push({ label: t("bomCreation.refreshRates"), variant: "btn-outline-primary",
        disabled: saving || loading || ratesLoading,
        onClick: () => { markDirty(); setRatesRevision((value) => value + 1); },
      });
    }
    if (!isReadOnly) {
      actions.push({
        label: saving ? t("common.saving") : t("common.save"),
        variant: "btn-success",
        disabled: saving || loading || routingLoading || ratesLoading,
        onClick: handleSave,
      });
    }

    // Frappe's own rule (toolbar.js can_submit): no Submit for a document that
    // does not exist yet, none while it has unsaved changes, and none at all on
    // a Workflow doctype -- there the transition actions replace it, and a plain
    // submit would skip the first approval state.
    const { showSubmit, showTransitions } = resolveForwardActions({
      isEdit: !isNew,
      isSubmitted: Number(doc.docstatus) !== 0,
      isDirty: dirty,
      hasWorkflow,
      workflowChecked,
      transitionCount: transitions.length,
    });

    if (showSubmit || showTransitions) {
      // One button per Workflow transition; unrecognised action names are shown
      // verbatim, exactly as the backend's Action Master has them.
      (showTransitions ? transitions : [{ action: null }]).forEach((tr, i) => {
        const labelKey = tr.action ? workflowActionLabelKey(tr.action) : null;
        actions.push({
          label: tr.action
            ? labelKey
              ? t(labelKey)
              : tr.action
            : saving
              ? t("common.submitting")
              : t("common.submit"),
          variant: i === 0 ? "btn-primary" : "btn-outline-primary",
          disabled: saving || loading,
          onClick: () => handleSubmit(doc.name, tr.action),
        });
      });
    }

    if (!isNew && doc.docstatus === 0 && !isReadOnly) {
      actions.push({
        label: t("common.delete"),
        variant: "btn-outline-danger",
        disabled: saving || loading,
        onClick: () => setConfirmDelete(true),
      });
    }

    if (!isNew && decodedDoctype === "Project") {
      actions.push({
        label: t("projects.overview"),
        variant: "btn-outline-primary",
        disabled: dirty || saving || loading,
        onClick: () => navigate(`/projects/view/${encodeURIComponent(docRef.current.name)}`),
      });
    }

    const errorCount = countErrors(errors);
    const focusFirstErr = () => {
      requestAnimationFrame(() => focusFirstError(errors));
    };
    const titleField = doctypeConfig.form?.titleField;
    const rawDocTitle = titleField ? doc[titleField] : doc.name;
    const docTitle = titleField
      ? shortenText(
          doctypeConfig.form?.titleFieldIsHtml
            ? plainText(rawDocTitle)
            : rawDocTitle,
          doctypeConfig.form?.titleMaxLength,
        ) || doc.name || decodedDoctype
      : doc.name || decodedDoctype;

    setHeader({
      status,
      title: isNew
        ? t("common.createNew", { name: decodedDoctype })
        : docTitle,
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
        { label: isNew ? t("common.new") : docTitle },
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
    routingLoading,
    ratesLoading,
    layoutMode,
    activeStep,
    steps.length,
    isReadOnly,
    t,
    errors,
    transitions,
    confirmDelete,
    attachmentsEnabled,
    status,
    workflowChecked,
    dirty,
    initialAttachment,
  ]);

  /* ===============================
     RENDER HELPERS
  ============================== */
  const renderField = (field) => {
    const Renderer = getFieldRenderer(field.fieldtype);
    return (
      <>
      <Renderer
        key={field.fieldname}
        field={field}
        value={doc[field.fieldname]}
        onChange={(val) => handleFieldChange(field.fieldname, val)}
        error={errors[field.fieldname]}
        disabled={isReadOnly}
      />
      {decodedDoctype === "BOM" && field.fieldname === "item" && doc.project && <ProjectSalesItemPicker key={doc.project} project={doc.project} disabled={isReadOnly || !!field.read_only} onSelect={(row) => {
        handleFieldChange("item", row.item_code);
        setDoc((prev) => ({ ...prev, uom: row.stock_uom }));
      }} />}
      </>
    );
  };

  const renderSectionFields = (fields, fillTable = false) => {
    const rows = [];
    let currentRow = [];

    fields.forEach((field) => {
      if (isBomForm && (!operationFieldVisible(field.fieldname, doc) || !inspectionFieldVisible(field.fieldname, doc))) return;
      if (decodedDoctype === "BOM" && field.fieldname === "custom_approved_vendor_files" && Number(doc.custom_avl_applicable) !== 1) return;
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
      <div className={fillTable ? "flex min-h-0 flex-1 flex-col" : undefined}>
        {rows.map((row, rowIdx) => {
          if (row.length === 1 && row[0].fieldtype === "Table") {
            const cf = row[0];
            const childFields =
              cf.options && childMeta[cf.options] ? childMeta[cf.options] : [];
            const editableChildFields = childFields.filter((field) => field.fieldname && !field.hidden && !["Section Break", "Column Break", "Tab Break", "Fold", "Page Break", "HTML", "Button"].includes(field.fieldtype) && !["parent", "parenttype", "parentfield", "idx", "custom_estimated_chargeable_qty", "custom_estimated_pricing_amount"].includes(field.fieldname));
            const listChildFields = editableChildFields.filter((field) => field.in_list_view || field.reqd);
            return (
              <div key={rowIdx} className={fillTable ? "flex min-h-0 flex-1 flex-col" : "mb-3"}>
                <ChildTable
                  fillHeight={fillTable}
                  title={cf.label}
                  bomAttachments={decodedDoctype === "BOM" && cf.fieldname === "items" && attachmentsEnabled}
                  bomName={decodedName}
                  totalField={decodedDoctype === "BOM" && cf.fieldname === "items" ? (bomTableColumns(cf.options, childFields)?.includes("amount") ? "amount" : "custom_purchase_amount") : undefined}
                  currency={doc.currency}
                  compactFields={(isBomForm && bomTableColumns(cf.options, childFields)) || (listChildFields.length ? listChildFields : editableChildFields.slice(0, 4)).map((field) => field.fieldname)}
                  pricingSide={["Purchase Order", "Purchase Receipt", "Purchase Invoice", "Supplier Quotation", "Material Request"].includes(decodedDoctype) ? "buying" : ["Sales Order", "Sales Invoice", "Delivery Note", "Quotation", "POS Invoice"].includes(decodedDoctype) ? "selling" : undefined}
                  columns={editableChildFields
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
                      readOnly: !!c.read_only,
                      fetchFrom: c.fetch_from,
                    }))}
                  value={doc[cf.fieldname] || []}
                  onChange={(val) => handleFieldChange(cf.fieldname, val)}
                  disabled={isReadOnly || !!cf.read_only || (cf.fieldname === "operations" && routingLoading)}
                />
              </div>
            );
          }

          return (
            <div
              key={rowIdx}
              className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-12"
            >
              {row.map((field) => {
                const colClass =
                  row.length >= 3
                    ? "md:col-span-6 lg:col-span-4 xl:col-span-3"
                    : row.length === 2
                      ? "md:col-span-6"
                      : "md:col-span-12";
                if (field.hidden) return null;

                return (
                  <div key={field.fieldname} className={isBomForm && field.fieldname === "item" ? "md:col-span-12" : colClass}>
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
    if (isBomForm && index < 2) return true;
    if (total <= 2) return true;
    return index === 0;
  };

  const renderSectionCard = (section, key, sectionIndex = 0, total = 1, fillTable = false, sectionTab = false) => {
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
        className={`${isBomForm ? "mb-0 ring-0 hover:shadow-none" : "mb-3"} ${sectionIndex > 0 ? "border-t border-border/70" : ""} ${fillTable ? "flex min-h-0 flex-1 flex-col" : ""}`}
        contentClassName={fillTable ? "flex min-h-0 flex-1 flex-col" : undefined}
        collapsible={!sectionTab}
        defaultOpen={defaultOpen}
        errorCount={errorCount}
        open={open}
        onOpenChange={(next) => {
          setSectionOpenOverrides((prev) => ({ ...prev, [secKey]: next }));
        }}
      >
        {renderSectionFields(section.fields, fillTable)}
      </FormSection>
    );
  };

  const renderMetadata = () => (
    <dl className="grid grid-cols-1 gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {[[t("common.id"), doc.name], [t("common.created"), doc.creation], [t("common.modified"), doc.modified], [t("common.owner"), doc.owner]].map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt>
          <dd className="break-words text-foreground">{!isNew && value ? value : "—"}</dd>
        </div>
      ))}
    </dl>
  );

  const renderTabsTree = (tabList, stepper = false) => {
    if (!tabList.length) return null;

    return (
      <Tabs
        value={String(activeTab)}
        onValueChange={(v) => {
          setActiveTab(Number(v));
          setSummary("");
        }}
        className="min-h-0 w-full flex-1 gap-0 overflow-hidden bg-card"
      >
        <TabsList
          variant="default"
          className="h-auto w-full shrink-0 justify-start gap-0 overflow-x-auto rounded-none border-b border-border/60 bg-card p-0"
        >
          {tabList.map((tab, i) => {
            const names = sectionFieldNames(tab.sections);
            const errCount = names.filter((n) => errors[n]).length;
            return (
              <TabsTrigger
                key={tab.id}
                value={String(i)}
                className="min-h-9 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground shadow-none after:hidden hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {tab.label || (tabList.length === 1 ? t("common.details") : t("common.tab", { n: i + 1 }))}
                {errCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums text-destructive-foreground">
                    {errCount}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value={String(tabList.length)} className="min-h-9 flex-none gap-2 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground shadow-none after:hidden hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            {t("common.metadata")}
          </TabsTrigger>
        </TabsList>
        {tabList.map((tab, i) => {
          const visibleFields = tab.sections.length === 1 ? tab.sections[0].fields.filter((field) => !field.hidden && !["Section Break", "Column Break", "Tab Break", "Fold", "Page Break"].includes(field.fieldtype)) : [];
          const fillTable = !stepper && !tab.description && visibleFields.length === 1 && visibleFields[0].fieldtype === "Table";
          return <TabsContent key={tab.id} value={String(i)} className={`m-0 min-h-0 border-s border-border/60 p-0 ${fillTable ? "flex-col overflow-hidden data-[state=active]:flex" : "overflow-y-auto overscroll-contain"}`}>
            {tab.description && (
              <p className="mb-3 text-xs text-muted-foreground">
                {tab.description}
              </p>
            )}
            {stepper ? renderStepper() : tab.sections.map((s, si) =>
              renderSectionCard(
                s,
                `${tab.id}-s${si}`,
                si,
                tab.sections.length,
                fillTable,
                tab.sectionTab && tab.sections.length === 1,
              ),
            )}
          </TabsContent>;
        })}
        <TabsContent value={String(tabList.length)} className="m-0 min-h-0 overflow-y-auto overscroll-contain border-s border-border/60 p-0">
          {renderMetadata()}
        </TabsContent>
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
    body = renderTabsTree([{ id: "form-steps", label: t("common.details"), sections: [] }], true);
  } else {
    body = renderTabsTree(tabsTree);
  }

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          handleDelete(doc.name);
        }}
        title={t("common.deleteConfirmTitle")}
        message={t("common.deleteConfirm", { name: decodedDoctype })}
        loading={saving}
      />

      <AttachDialog
        show={!isNew && showAttachments}
        doctype={decodedDoctype}
        docname={decodedName}
        readOnly={isReadOnly}
        onClose={() => setShowAttachments(false)}
      />

      <div className={hasCompactTabs ? "mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col overflow-hidden" : isBomForm ? "mx-auto w-full max-w-[1600px] pt-4" : "mx-auto w-full max-w-[1100px]"}>
      <FormErrorSummary summary={summary} fieldErrors={errors} className={hasCompactTabs ? "mx-3 mb-4 mt-3 sm:mx-4" : "mb-4"} />

      <RequiredAttachmentDialog
        show={isNew && showAttachments}
        onClose={() => setShowAttachments(false)}
        doctype={decodedDoctype}
        value={initialAttachment}
        onChange={setInitialAttachment}
        disabled={saving}
      />

      {decodedDoctype === "BOM" && ratesLoading && <p role="status" className={`mb-3 text-sm text-muted-foreground ${hasCompactTabs ? "px-4 pt-3" : ""}`}>{t("bomCreation.fetchingRates")}</p>}
      {decodedDoctype === "BOM" && ratesError && <p role="alert" className={`mb-3 text-sm text-destructive ${hasCompactTabs ? "px-4 pt-3" : ""}`}>{ratesError}</p>}
      {body}

    </div>
    </>
  );
}
