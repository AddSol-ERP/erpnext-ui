import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import { get } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import { ClipboardList } from "lucide-react";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { gridCorners } from "../../../../lib/gridCorners";
import FormSelect from "../../../../components/FormSelect";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import { AttachDialog, RequiredAttachmentDialog } from "../../../../components/Attachments";
import {
  errorList,
  focusFirstError,
  requiredFields,
} from "../../../../lib/formValidation";
import {
  choiceResult,
  formulaForChoices,
  isFormulaResponse,
  isManualResponse,
  isNumericResponse,
  parseResponseConfig,
  serializeResponseConfig,
} from "../../../../lib/qualityResponse";

/*
 * ERPNext option strings, copied verbatim from
 * erpnext/stock/doctype/quality_inspection/quality_inspection.json.
 *
 * These are VALUES posted to the server, not display strings: a typo here is
 * a Dynamic Link / Link validation failure naming the reference rather than
 * the field, so they are deliberately not translated and deliberately not
 * "tidied". The suite asserts them character for character against the
 * doctype JSON.
 *
 * Inspection Type labels are reused from the list and report pages, which
 * already translate them.
 */
const INSPECTION_TYPES = [
  ["Incoming", "quality.typeIncoming"],
  ["Outgoing", "quality.typeOutgoing"],
  ["In Process", "quality.typeInProcess"],
];

const REFERENCE_TYPES = [
  "Purchase Receipt",
  "Purchase Invoice",
  "Subcontracting Receipt",
  "Delivery Note",
  "Sales Invoice",
  "Stock Entry",
  "Job Card",
];

// ERPNext declares sample_size as Float with default "1". Coerced, because an
// <input type="number"> hands back a string and a string would be stored as a
// string in the posted JSON.
const DEFAULT_SAMPLE_SIZE = 1;

const PARAM_BP = [{ cols: 1 }, { min: "md", cols: 2 }, { min: "lg", cols: 3 }];

export default function InspectionForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  const [doc, setDoc] = useState({
    template: "",
    item_code: "",
    // ERPNext marks all four of these `reqd` on Quality Inspection. Without
    // them every save dies in `_validate_mandatory`, which is reached only
    // AFTER `_validate_links` -- so the failure arrives one stage later than
    // it used to, and reports four fields at once.
    inspection_type: "",
    reference_type: "",
    reference_name: "",
    sample_size: DEFAULT_SAMPLE_SIZE,
    remarks: "",
    // ERPNext makes a submitted Quality Inspection read-only. It was never
    // tracked here, so `!doc.docstatus` was ALWAYS true -- the header had no
    // way to tell a draft from a submitted document.
    docstatus: 0,
  });
  // Event-based, never diff-based. Diffing would leave Save permanently hidden,
  // because effects also write to `doc` (loadDoc, the post-submit docstatus
  // bump) and those are not edits.
  const [dirty, setDirty] = useState(false);

  /*
   * Every edit goes through here, so a new field cannot be added without
   * becoming dirty. The alternative -- calling setDirty at each onChange -- is
   * how the Purchase Receipt form ended up needing an audit.
   */
  const updateDoc = (patch) => {
    setDoc((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Attach, from the header, on any SAVED inspection -- submitted included.
  // The dialog used to live only on the Quality report page, launched by
  // clicking a "recent failure" row, because at the time it was written there
  // was no Quality Inspection form in the SPA at all (the comment that said so
  // outlived the form itself). Attaching here is the same server call: the
  // report's rows were docstatus 1, so submitted attach is the working case.
  const [showAttach, setShowAttach] = useState(false);
  const [initialAttachment, setInitialAttachment] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Always points at the newest document. The Save button is registered into
  // the page toolbar by an effect that deliberately does not depend on `doc`
  // (re-running it per keystroke would thrash the toolbar), so the registered
  // handler closes over the document as of an early render -- validation and
  // the saved payload then used stale data. Handlers read through this ref.
  const toast = useToast();
  const docRef = useRef(doc);

  // Synced in an effect, not during render: the React Compiler lint rule
  // forbids mutating a ref while rendering. Handlers run after a commit.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);


  const [parameters, setParameters] = useState([]);

  /* ================= CALC ================= */
  const calculatedParameterStatus = (parameter) => {
    const config = parameter.responseConfig;
    if (config?.type === "numeric_range") {
      const values = (parameter.values || []).filter((value) => value !== "" && value != null);
      if (!values.length || parameter.min_value === "" || parameter.max_value === "") return "Pending";
      const numbers = values.map(Number);
      if (numbers.some((value) => !Number.isFinite(value))) return "Pending";
      return numbers.every((value) => value >= Number(parameter.min_value) && value <= Number(parameter.max_value))
        ? "Accepted"
        : "Rejected";
    }
    if (config?.type === "formula_numeric" || config?.type === "formula_text") return parameter.status || "Pending";
    if (config?.type === "free_text") return parameter.manualStatus || "Pending";
    if (["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config?.type)) {
      return parameter.readingValue ? (choiceResult(config, parameter.readingValue) || "Pending") : "Pending";
    }
    if (config?.type === "exact_value") {
      return parameter.readingValue !== ""
        ? (parameter.readingValue === String(parameter.value ?? "") ? "Accepted" : "Rejected")
        : "Pending";
    }
    return "Pending";
  };

  const updateReading = (pi, vi, value) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) => {
      if (index !== pi) return parameter;
      const next = { ...parameter, values: [...parameter.values] };
      next.values[vi] = value;
      next.status = isFormulaResponse(next.responseConfig)
        ? "Pending"
        : calculatedParameterStatus(next);
      return next;
    }));
  };

  const updateReadingValue = (pi, readingValue) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) => {
      if (index !== pi) return parameter;
      const next = { ...parameter, readingValue };
      next.status = isFormulaResponse(next.responseConfig)
        ? "Pending"
        : calculatedParameterStatus(next);
      return next;
    }));
  };

  const updateParameterRemark = (pi, remark) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) =>
      index === pi ? { ...parameter, remark } : parameter,
    ));
  };

  const setManualStatus = (pi, status) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) =>
      index === pi ? { ...parameter, manualStatus: status, status } : parameter,
    ));
  };

  /* ================= RESULT ================= */
  const overallStatus = (() => {
    if (!parameters.length) return "";

    if (parameters.some((p) => calculatedParameterStatus(p) === "Pending")) return "Pending";

    if (parameters.some((p) => calculatedParameterStatus(p) === "Rejected")) return "Rejected";

    return "Accepted";
  })();

  /* ================= REFERENCE ================= */

  /**
   * Changing the reference type MUST clear the reference name.
   *
   * `reference_name` is a Dynamic Link whose target doctype IS
   * `reference_type`. Leaving a name behind sends e.g. MAT-PRE-00042 with
   * reference_type "Delivery Note", and ERPNext reports that as
   * "Could not find Reference Name: MAT-PRE-00042" -- naming the reference
   * rather than the mismatch, so it reads as if the chosen document were
   * deleted. It is the one field in this form that can silently become wrong.
   */
  const handleReferenceTypeChange = (reference_type) => {
    updateDoc({ reference_type, reference_name: "" });
    setFieldErrors((prev) => ({ ...prev, reference_type: "", reference_name: "" }));
  };

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    const res = await get(`resource/Quality Inspection/${name}`);
    const d = res.data;

    // Every editable field is mapped back, or a re-save silently blanks it.
    // These four were absent once, which is why an edit-and-save of an existing
    // inspection would have failed mandatory validation on a document that was
    // perfectly valid when it was loaded.
    setDoc({
      template: d.quality_inspection_template,
      item_code: d.item_code,
      inspection_type: d.inspection_type || "",
      reference_type: d.reference_type || "",
      reference_name: d.reference_name || "",
      sample_size: d.sample_size ?? DEFAULT_SAMPLE_SIZE,
      remarks: d.remarks || "",
      docstatus: d.docstatus ?? 0,
    });

    const templateRes = await get(
      `resource/Quality Inspection Template/${d.quality_inspection_template}`,
    );

    const templateParams =
      templateRes.data.item_quality_inspection_parameter || [];

    const readingsMap = {};
    (d.readings || []).forEach((r) => {
      readingsMap[r.specification] = r;
    });

    const merged = templateParams.map((t) => {
      const existing = readingsMap[t.specification];
      const responseConfig = parseResponseConfig(
        existing?.custom_response_config || t.custom_response_config,
        existing || t,
      );
      const allValues = Array.from({ length: 10 }, (_, index) => {
        const value = existing?.[`reading_${index + 1}`];
        return value == null ? "" : String(value);
      });
      const lastValueIndex = allValues.reduce(
        (last, value, index) => value !== "" ? index : last,
        -1,
      );
      const values = allValues.slice(0, Math.max(lastValueIndex + 1, 1));

      const parameter = {
        parameter: t.specification,
        responseConfig,
        numeric: existing?.numeric ?? t.numeric,
        min_value: existing?.min_value ?? t.min_value ?? "",
        max_value: existing?.max_value ?? t.max_value ?? "",
        value: existing?.value ?? t.value ?? "",
        acceptance_formula: existing?.acceptance_formula ?? t.acceptance_formula ?? "",
        values,
        readingValue: existing?.reading_value == null ? "" : String(existing.reading_value),
        remark: existing?.custom_parameter_remarks || "",
        manualStatus: existing?.status === "Accepted" || existing?.status === "Rejected"
          ? existing.status
          : "",
        status: existing?.status || "Pending",
      };
      parameter.status = calculatedParameterStatus(parameter);
      if (isFormulaResponse(responseConfig)) {
        parameter.status = existing?.status || "Pending";
      }
      return parameter;
    });

    setParameters(merged);
  };

  /* ================= TEMPLATE LOAD ================= */
  const handleTemplateChange = async (template) => {
    updateDoc({ template });

    const res = await get(`resource/Quality Inspection Template/${template}`);

    const rows = res.data.item_quality_inspection_parameter || [];

    const mapped = rows.map((r) => ({
      parameter: r.specification,
      responseConfig: parseResponseConfig(r.custom_response_config, r),
      numeric: r.numeric,
      min_value: r.min_value ?? "",
      max_value: r.max_value ?? "",
      value: r.value ?? "",
      acceptance_formula: r.acceptance_formula || "",
      values: [""],
      readingValue: "",
      remark: "",
      manualStatus: "",
      status: "Pending",
    }));

    setParameters(mapped);
  };

  /* ================= SAVE ================= */

  // The Save payload also depends on the computed overall status and the
  // reading rows, which are not part of `doc` -- same staleness problem, so they
  // are read through refs too. Declared here, after `overallStatus` exists, and
  // initialised with no value: reading it in useRef's argument list would
  // evaluate it during render and hit the temporal dead zone.
  const overallStatusRef = useRef(null);
  const parametersRef = useRef([]);

  useEffect(() => {
    overallStatusRef.current = overallStatus;
    parametersRef.current = parameters;
  });

  const isParameterComplete = (parameter) => {
    const type = parameter.responseConfig?.type;
    if (type === "numeric_range") {
      return parameter.values.some((value) => value !== "")
        && parameter.min_value !== ""
        && parameter.max_value !== "";
    }
    if (type === "formula_numeric") {
      return !!parameter.acceptance_formula.trim()
        && parameter.values.some((value) => value !== "");
    }
    if (type === "formula_text") {
      return !!parameter.acceptance_formula.trim() && !!parameter.readingValue.trim();
    }
    if (type === "free_text") {
      return !!parameter.readingValue.trim()
        && ["Accepted", "Rejected"].includes(parameter.manualStatus);
    }
    if (type === "exact_value") return !!parameter.readingValue;
    return !!parameter.readingValue
      && (parameter.responseConfig?.choices || []).some(
        (choice) => choice.value === parameter.readingValue,
      );
  };

  const getIncompleteParameters = () => parametersRef.current.filter((parameter) => !isParameterComplete(parameter));

  /*
   * Save and Submit have OPPOSITE conditions and must not share one `if` --
   * the same correction made on the Plate Offcut form.
   */
  const canSave = !doc.docstatus && (dirty || !isEdit);
  const canSubmit = !doc.docstatus && !dirty && isEdit;

  /**
   * The posted document. One builder, shared by Save and Submit.
   *
   * It used to be inlined in the save handler, which left nothing for Submit
   * to reuse -- so Submit was given its own copy, drifted, and ended up
   * omitting the four mandatory header fields.
   */
  const payloadFrom = (current) => ({
    item_code: current.item_code,
    quality_inspection_template: current.template,
    // Mandatory on the doctype. Omitting them produced
    // `MandatoryError: [Quality Inspection, ...]: inspection_type,
    // reference_type, reference_name, sample_size`.
    inspection_type: current.inspection_type,
    reference_type: current.reference_type,
    reference_name: current.reference_name,
    sample_size: Number(current.sample_size) || DEFAULT_SAMPLE_SIZE,
    remarks: current.remarks || "",
    // ERPNext's status field accepts Accepted/Rejected; Pending is represented
    // by incomplete reading rows while the document is still a draft.
    status: overallStatusRef.current === "Rejected" ? "Rejected" : "Accepted",
    readings: parametersRef.current.map((p) => {
      const config = parseResponseConfig(p.responseConfig);
      const complete = isParameterComplete(p);
      const numeric = isNumericResponse(config);
      const formula = isFormulaResponse(config)
        || ["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config.type);
      const manual = isManualResponse(config) || !complete;
      const row = {
        specification: p.parameter,
        custom_response_config: serializeResponseConfig(config),
        custom_parameter_remarks: p.remark || "",
        numeric: numeric ? 1 : 0,
        formula_based_criteria: formula ? 1 : 0,
        manual_inspection: manual ? 1 : 0,
        min_value: p.min_value ?? "",
        max_value: p.max_value ?? "",
        value: p.value ?? "",
        acceptance_formula: ["yes_no", "ok_not_ok", "pass_fail", "choices"].includes(config.type)
          ? formulaForChoices(config)
          : p.acceptance_formula || "",
        reading_value: p.readingValue ?? "",
        status: manual
          ? (isManualResponse(config) ? p.manualStatus || "" : "")
          : p.status,
      };
      for (let index = 0; index < 10; index += 1) {
        row[`reading_${index + 1}`] = p.values?.[index] ?? "";
      }
      return row;
    }),
  });

  const handleSave = async () => {
    const current = docRef.current;
    const payload = payloadFrom(current);

    // A failed save has to be LOUD. This used to call saveDocument bare, so the
    // rejection escaped an async event handler, the only trace was an
    // unhandled promise in the console, and the form sat there looking like it
    // had worked -- because the navigate() below never ran either, so nothing
    // on screen changed at all. Four missing mandatory fields produced exactly
    // that: a button that does nothing.
    // Checked here so the four fields are MARKED rather than merely refused.
    // The server already reports all four at once, but only after the round
    // trip, and only as one toast -- an inline error per field is what lets
    // the user see what is missing while the form is still in front of them.
    const errs = requiredFields(
      current,
      {
        inspection_type: t("quality.inspectionType"),
        reference_type: t("quality.referenceType"),
        reference_name: t("quality.referenceName"),
        sample_size: t("quality.sampleSize"),
      },
      t,
    );
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      const list = errorList(errs);
      setError(list.length > 1 ? t("common.fixErrors") : list[0]);
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }
    setError("");

    setSaving(true);
    try {
      await saveDocument({
        doctype: "Quality Inspection",
        name: isEdit ? name : undefined,
        doc: payload,
        initialAttachment: isEdit ? undefined : initialAttachment,
      });
      // Same shape as GenericForm: the raw doctype name, not a translated
      // label, because that is what every other form in this app does.
      toast.success(
        isEdit
          ? t("common.updatedSuccess", { name: "Quality Inspection" })
          : t("common.createdSuccess", { name: "Quality Inspection" }),
      );
      navigate("/quality/inspection");
    } catch (e) {
      // e.message is already the server's own wording, resolved from
      // _server_messages and with informational `alert: 1` entries filtered
      // out -- so this names the field to fix rather than an unrelated notice
      // that happened to be sent first.
      toast.error(e.message || t("common.saveFailed"));
      if (e?.savedDocName) navigate(`/quality/inspection/${encodeURIComponent(e.savedDocName)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ================= SUBMIT ================= */

  /**
   * Save, then submit. Never just save.
   *
   * The header's Submit action used to call `handleSave`, so it saved a second
   * time and reported success with a toast that said "created successfully"
   * while leaving the document at docstatus 0. The user had no way to tell the
   * two apart, because both buttons did exactly the same thing.
   *
   * `submitDocument` is called with NO `doc`, so it fetches the stored document
   * and posts that to `frappe.client.submit` -- which takes the WHOLE document,
   * not `{doctype, name}`. Passing our trimmed payload instead would submit a
   * partial document.
   */
  const handleSubmit = async () => {
    const current = docRef.current;

    if (getIncompleteParameters().length) {
      setError(t("quality.completeAllParameters"));
      return;
    }

    const errs = requiredFields(
      current,
      {
        inspection_type: t("quality.inspectionType"),
        reference_type: t("quality.referenceType"),
        reference_name: t("quality.referenceName"),
        sample_size: t("quality.sampleSize"),
      },
      t,
    );
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      const list = errorList(errs);
      setError(list.length > 1 ? t("common.fixErrors") : list[0]);
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }
    setError("");

    setSaving(true);
    try {
      // Save first: on a NEW form there is nothing stored to submit yet, and on
      // an edited draft the stored copy is not what the user just corrected.
      const saved = await saveDocument({
        doctype: "Quality Inspection",
        name: isEdit ? name : undefined,
        doc: payloadFrom(current),
        initialAttachment: isEdit ? undefined : initialAttachment,
      });
      const savedName = saved.data.name;
      await submitDocument({
        doctype: "Quality Inspection",
        name: savedName,
        initialAttachment: isEdit ? undefined : initialAttachment,
      });
      setDoc({ ...current, docstatus: 1, name: savedName });
      setDirty(false);
      toast.success(
        t("common.submittedSuccess", { name: "Quality Inspection" }),
      );
      navigate("/quality/inspection");
    } catch (e) {
      toast.error(e.message || t("common.submitFailed"));
      if (e?.savedDocName) navigate(`/quality/inspection/${encodeURIComponent(e.savedDocName)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("quality.inspectionTitle", { name: doc.name || "" })
        : t("quality.newInspection"),

      subtitle: isEdit
        ? t("quality.inspectionEditSubtitle")
        : t("quality.inspectionNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.inspections"), path: "/quality/inspection" },
        {
          label: isEdit ? doc.name || t("common.edit") : t("common.new"),
        },
      ],

      // A submitted Quality Inspection is READ-ONLY in ERPNext (docstatus 1,
      // allow_on_submit is not set on any editable field here). Offering Save
      // and Submit on one is not just misleading -- Save would be rejected by
      // the server, and the user would have no way to tell that from a real
      // save.
      //
      // Save is also gated on `dirty`, and Submit on `!dirty`: they are
      // opposite conditions, since Submit acts on the STORED document and must
      // not run against edits that were never saved.
      actions: [
        canSave && {
          label: t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
          // Stops a double-submit: two POSTs would create two Quality
          // Inspections, and the second would collide on the naming series
          // with an error the user cannot connect to the first click.
          disabled: saving,
        },

        canSubmit && {
          label: t("common.submit"),
          variant: "btn-primary",
          // Was `handleSave`, so "Submit" saved a second time and toasted
          // "created successfully" while leaving the document at docstatus 0.
          onClick: handleSubmit,
          disabled: saving,
        },

        // Any saved inspection, draft or submitted: a defect photo belongs with
        // the inspection whether or not the readings are final, and submitted is
        // the case the report page's attach used to serve.
        isEdit && {
          label: t("attachments.open"),
          variant: "btn-outline-primary",
          onClick: () => setShowAttach(true),
        },
        !isEdit && {
          label: t("attachments.open"),
          variant: "btn-outline-primary",
          onClick: () => setShowAttach(true),
        },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, doc, initialAttachment]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    if (isEdit) {
      // loadDoc only setStates after awaited API responses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* BASIC */}
      <FormSection
        className="mb-3"
        title={t("quality.basicInfo")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
          <FormField label={t("quality.template")} required>
            <LinkField
              doctype="Quality Inspection Template"
              value={doc.template}
              onChange={handleTemplateChange}
              disabled={isEdit}
            />
          </FormField>

          <FormField
            label={t("quality.item")}
            error={fieldErrors.item_code}
            required
          >
            <LinkField
              doctype="Item"
              value={doc.item_code}
              onChange={(v) => updateDoc({ item_code: v })}
              disabled={Boolean(doc.docstatus)}
            />
          </FormField>

          <FormField
            label={t("quality.inspectionType")}
            error={fieldErrors.inspection_type}
            required
          >
            <FormSelect
              value={doc.inspection_type}
              disabled={Boolean(doc.docstatus)}
              onChange={(v) => {
                updateDoc({ inspection_type: v });
                setFieldErrors((p) => ({ ...p, inspection_type: "" }));
              }}
              placeholder={t("quality.selectType")}
              options={INSPECTION_TYPES.map(([value, key]) => [value, t(key)])}
            />
          </FormField>

          <FormField
            label={t("quality.referenceType")}
            error={fieldErrors.reference_type}
            required
          >
            <FormSelect
              value={doc.reference_type}
              disabled={Boolean(doc.docstatus)}
              onChange={handleReferenceTypeChange}
              placeholder={t("quality.selectType")}
              // Raw ERPNext doctype names, untranslated on purpose: these double
              // as the values posted to the server. Passed as [value, label]
              // tuples -- FormSelect also accepts bare strings, but spelling the
              // tuple out keeps value and label obviously identical here, which
              // is the whole point of not translating them.
              options={REFERENCE_TYPES.map((name) => [name, name])}
            />
          </FormField>

          <FormField
            label={t("quality.referenceName")}
            error={fieldErrors.reference_name}
            hint={t("quality.referenceNameHint")}
            required
          >
            <LinkField
              // A Dynamic Link: the target doctype IS the reference type.
              // Disabled until one is chosen, because an empty doctype would
              // fire a link search against nothing.
              doctype={doc.reference_type || undefined}
              value={doc.reference_name}
              onChange={(v) => {
                updateDoc({ reference_name: v });
                setFieldErrors((p) => ({ ...p, reference_name: "" }));
              }}
              disabled={Boolean(doc.docstatus) || !doc.reference_type}
              placeholder={t(
                doc.reference_type
                  ? "quality.selectReference"
                  : "quality.chooseReferenceTypeFirst",
              )}
              // Parent-level filter only. Filtering this list by `item_code`
              // would resolve against the child's table and cross-join
              // (invariant 14), returning every document with the item on any
              // row and paginating wrongly.
              filters={{ docstatus: ["<", 2] }}
            />
          </FormField>

          <FormField
            label={t("quality.sampleSize")}
            error={fieldErrors.sample_size}
            required
          >
            <Input
              type="number"
              min="1"
              step="1"
              className="h-8"
              value={doc.sample_size}
              disabled={Boolean(doc.docstatus)}
              onChange={(e) => {
                updateDoc({ sample_size: e.target.value });
                setFieldErrors((p) => ({ ...p, sample_size: "" }));
              }}
            />
          </FormField>
      </FormSection>

      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* PARAMETERS */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {parameters.map((p, i) => {
          const result = calculatedParameterStatus(p);
          const responseType = p.responseConfig?.type || "numeric_range";
          return (
            <Card
              key={i}
              className={gridCorners({
                breakpoints: PARAM_BP,
                index: i,
                count: parameters.length,
              })}
            >
              <CardContent className="p-4">
                <div className="text-center font-bold">{p.parameter}</div>
                <p className="mb-3 mt-1 text-center text-xs text-muted-foreground">
                  {t(`quality.responseTypes.${responseType}`)}
                  {responseType === "numeric_range" ? ` · ${p.min_value} – ${p.max_value}` : ""}
                  {responseType === "exact_value" ? ` · ${t("quality.expectedValue")}: ${p.value}` : ""}
                </p>

                {isNumericResponse(p.responseConfig) ? (
                  <div className="space-y-2">
                    {responseType === "formula_numeric" ? (
                      <p className="text-xs text-muted-foreground">
                        {t("quality.formula")}: {p.acceptance_formula || t("quality.formulaShownOnTemplate")}
                      </p>
                    ) : null}
                    {p.values.map((value, index) => (
                      <Input
                        key={index}
                        className="text-center"
                        type="number"
                        value={value}
                        disabled={Boolean(doc.docstatus)}
                        placeholder={t("quality.reading", { n: index + 1 })}
                        onChange={(event) => updateReading(i, index, event.target.value)}
                      />
                    ))}
                    {p.values.length < 10 && !doc.docstatus ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setParameters((current) => current.map((parameter, index) =>
                          index === i ? { ...parameter, values: [...parameter.values, ""] } : parameter,
                        ))}
                      >
                        + {t("quality.addReading")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {responseType === "formula_text" ? (
                      <p className="text-xs text-muted-foreground">
                        {t("quality.formula")}: {p.acceptance_formula || t("quality.formulaShownOnTemplate")}
                      </p>
                    ) : null}
                    {responseType === "free_text" ? (
                      <Textarea
                        rows={3}
                        value={p.readingValue}
                        disabled={Boolean(doc.docstatus)}
                        placeholder={t("quality.enterObservation")}
                        onChange={(event) => updateReadingValue(i, event.target.value)}
                      />
                    ) : (
                      <FormField label={t("quality.readingValue")}>
                        {responseType === "formula_text" || responseType === "exact_value" ? (
                          <Input
                            value={p.readingValue}
                            disabled={Boolean(doc.docstatus)}
                            placeholder={t("quality.enterResult")}
                            onChange={(event) => updateReadingValue(i, event.target.value)}
                          />
                        ) : (
                          <FormSelect
                            value={p.readingValue}
                            disabled={Boolean(doc.docstatus)}
                            placeholder={t("quality.chooseResult")}
                            onChange={(value) => updateReadingValue(i, value)}
                            options={(p.responseConfig?.choices || []).map((choice) => [choice.value, choice.value])}
                          />
                        )}
                      </FormField>
                    )}

                    {responseType === "free_text" ? (
                      <FormField label={t("quality.manualDecision")}>
                        <FormSelect
                          value={p.manualStatus}
                          disabled={Boolean(doc.docstatus)}
                          placeholder={t("quality.chooseResult")}
                          onChange={(value) => setManualStatus(i, value)}
                          options={[
                            ["Accepted", t("quality.statusAccepted")],
                            ["Rejected", t("quality.statusRejected")],
                          ]}
                        />
                      </FormField>
                    ) : null}
                  </div>
                )}

                <FormField className="mt-3" label={t("quality.parameterRemarks")}>
                  <Textarea
                    rows={2}
                    value={p.remark || ""}
                    disabled={Boolean(doc.docstatus)}
                    placeholder={t("quality.parameterRemarksHint")}
                    onChange={(event) => updateParameterRemark(i, event.target.value)}
                  />
                </FormField>

                <div className="mt-3 text-center">
                  <Badge
                    variant="outline"
                    className={
                      result === "Accepted"
                        ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                        : result === "Rejected"
                          ? "bg-destructive/15 text-destructive ring-destructive/30"
                          : "bg-muted text-muted-foreground ring-border"
                    }
                  >
                    {result === "Accepted"
                      ? t("quality.statusAccepted")
                      : result === "Rejected"
                        ? t("quality.statusRejected")
                        : t("quality.statusPending")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FormSection title={t("quality.inspectionRemarks")} icon={ClipboardList}>
        <Textarea
          rows={3}
          value={doc.remarks || ""}
          disabled={Boolean(doc.docstatus)}
          onChange={(event) => updateDoc({ remarks: event.target.value })}
        />
      </FormSection>

      {/* FINAL RESULT */}
      <Card className="mt-3">
        <CardContent className="p-4 text-center">
          <div className="text-sm text-muted-foreground">{t("quality.finalResult")}</div>
          <div
            className={`text-2xl font-bold ${
              overallStatus === "Accepted"
                ? "text-emerald-600"
                : overallStatus === "Rejected"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {overallStatus === "Accepted"
              ? t("quality.statusAccepted")
              : overallStatus === "Rejected"
                ? t("quality.statusRejected")
                : t("quality.statusPending")}
          </div>
        </CardContent>
      </Card>

      {/* Browse mode: single Done footer, closing submits nothing. */}
      <RequiredAttachmentDialog
        show={!isEdit && showAttach}
        onClose={() => setShowAttach(false)}
        doctype="Quality Inspection"
        value={initialAttachment}
        onChange={setInitialAttachment}
        disabled={saving}
        events={["save", "submit"]}
      />

      <AttachDialog
        show={isEdit && showAttach}
        doctype="Quality Inspection"
        docname={name || ""}
        readOnly={Boolean(doc.docstatus)}
        onClose={() => setShowAttach(false)}
      />
    </div>
  );
}
