import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import { get, getMethod } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import { ClipboardList } from "lucide-react";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import FormSelect from "../../../../components/FormSelect";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { AttachDialog, RequiredAttachmentDialog } from "../../../../components/Attachments";
import {
  countErrors,
  focusFirstError,
  requiredFields,
} from "../../../../lib/formValidation";
import {
  formulaForChoices,
  isFormulaResponse,
  isManualResponse,
  isNumericResponse,
  parseResponseConfig,
  serializeResponseConfig,
} from "../../../../lib/qualityResponse";
import {
  incompleteParameters,
  isParameterComplete,
  overallStatus as computeOverallStatus,
  parameterStatus,
  summariseInspection,
} from "../../../../lib/inspectionProgress";
import { questionStates } from "../../../../lib/inspectionPaper";
import { INSPECTION_TYPES, REFERENCE_TYPES } from "../../../../lib/inspectionTypes";
import { parseInspectionPrefill } from "../../../../lib/inspectionPrefill";
import {
  clearInspectionDraft,
  getInspectionDraft,
  setInspectionDraft,
} from "../../../../lib/inspectionDraft";
import QuestionRail from "./QuestionRail";
import InspectionQuestion from "./InspectionQuestion";
import InspectionReview from "./InspectionReview";

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
 * They live in the shared module, because the inspection list, its filter and
 * the hub's tiles need the same strings -- and a fix to one copy has to
 * reach the others.
 *
 * Inspection Type labels are reused from the list and report pages, which
 * already translate them.
 */

// ERPNext declares sample_size as Float with default "1". Coerced, because an
// <input type="number"> hands back a string and a string would be stored as a
// string in the posted JSON.
const DEFAULT_SAMPLE_SIZE = 1;
const EMPTY_REFERENCE_ITEMS = [];
const ADDITIONAL_FIELDS_METHOD = "method/erpnext_ui.quality_inspection.get_quality_inspection_field_config";

function configuredFieldDefault(field) {
  return field.fieldtype === "Check" ? 0 : "";
}

function configuredFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return configuredFieldDefault(field);
  if (["Int", "Float", "Currency", "Percent"].includes(field.fieldtype)) return Number(value);
  return value;
}

function getConfiguredFieldErrors(doc, fields, t) {
  const errors = {};
  fields.forEach((field) => {
    if (!(field.required_by_doctype || field.mandatory)) return;
    const value = doc[field.fieldname];
    if (value === null || value === undefined || value === "") {
      errors[field.fieldname] = t("common.fieldRequired", { field: field.label });
    }
  });
  return errors;
}

function splitSerialNumbers(value) {
  if (Array.isArray(value)) return value.map((serial) => String(serial).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[\n,]/).map((serial) => serial.trim()).filter(Boolean);
}

function getReferenceItemRows(reference) {
  if (!reference || typeof reference !== "object") return [];
  const rows = Object.values(reference)
    .filter(Array.isArray)
    .flat()
    .filter((row) => row && typeof row === "object" && row.item_code);
  if (reference.item_code && !rows.some((row) => row.item_code === reference.item_code)) {
    rows.unshift(reference);
  }
  return rows;
}


export default function InspectionForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  // The Store > Inspection Pending report opens this form with the stock row
  // already filled in. The parameters are initial values only; every field
  // remains editable. `parseInspectionPrefill` also rejects reference/value
  // pairs the doctype cannot accept, so a hand-edited URL cannot pre-fill a
  // broken Dynamic Link.
  const prefill = useMemo(
    () => parseInspectionPrefill(searchParams),
    [searchParams],
  );
  const hasPrefill = Object.keys(prefill).length > 0;

  const [doc, setDoc] = useState(() => ({
    template: "",
    item_code: "",
    // ERPNext marks all four of these `reqd` on Quality Inspection. Without
    // them every save dies in `_validate_mandatory`, which is reached only
    // AFTER `_validate_links` -- so the failure arrives one stage later than
    // it used to, and reports four fields at once.
    inspection_type: "",
    reference_type: "",
    reference_name: "",
    item_serial_no: "",
    batch_no: "",
    sample_size: DEFAULT_SAMPLE_SIZE,
    remarks: "",
    // ERPNext makes a submitted Quality Inspection read-only. It was never
    // tracked here, so `!doc.docstatus` was ALWAYS true -- the header had no
    // way to tell a draft from a submitted document.
    docstatus: 0,
    ...prefill,
  }));
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
  // Attach, from the header, on any SAVED inspection -- submitted included.
  // The dialog used to live only on the Quality report page, launched by
  // clicking a "recent failure" row, because at the time it was written there
  // was no Quality Inspection form in the SPA at all (the comment that said so
  // outlived the form itself). Attaching here is the same server call: the
  // report's rows were docstatus 1, so submitted attach is the working case.
  const [showAttach, setShowAttach] = useState(false);
  const [initialAttachment, setInitialAttachment] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [additionalFields, setAdditionalFields] = useState([]);
  const [referenceItemsState, setReferenceItemsState] = useState({ key: "", rows: [], error: false });
  const referenceRequestId = useRef(0);
  const referenceKey = doc.reference_type && doc.reference_name
    ? `${doc.reference_type}\u0000${doc.reference_name}`
    : "";

  useEffect(() => {
    const requestId = ++referenceRequestId.current;
    if (!doc.reference_type || !doc.reference_name) {
      return;
    }

    get(`resource/${encodeURIComponent(doc.reference_type)}/${encodeURIComponent(doc.reference_name)}`)
      .then(async (response) => {
        const reference = response?.data || {};
        const rows = getReferenceItemRows(reference);
        const bundles = [...new Set(rows.map((row) => row.serial_and_batch_bundle).filter(Boolean))];
        if (bundles.length) {
          const bundleDocs = await Promise.all(bundles.map(async (bundle) => {
            try {
              const result = await get(`resource/${encodeURIComponent("Serial and Batch Bundle")}/${encodeURIComponent(bundle)}`);
              return [bundle, result?.data || {}];
            } catch {
              return [bundle, {}];
            }
          }));
          const bundleMap = Object.fromEntries(bundleDocs);
          for (const row of rows) {
            const bundle = bundleMap[row.serial_and_batch_bundle];
            if (!bundle) continue;
            const entries = bundle.entries || bundle.voucher_detail_no || [];
            const matchingEntries = entries.filter((entry) => !entry.item_code || entry.item_code === row.item_code);
            row.batch_no = row.batch_no || matchingEntries.find((entry) => entry.batch_no)?.batch_no || "";
            row.serial_no = row.serial_no || matchingEntries.map((entry) => entry.serial_no).filter(Boolean);
          }
        }
        if (requestId === referenceRequestId.current) {
          setReferenceItemsState({
            key: `${doc.reference_type}\u0000${doc.reference_name}`,
            rows,
            error: false,
          });
        }
      })
      .catch(() => {
        if (requestId === referenceRequestId.current) {
          setReferenceItemsState({
            key: `${doc.reference_type}\u0000${doc.reference_name}`,
            rows: [],
            error: true,
          });
        }
      });

    return () => {
      referenceRequestId.current += 1;
    };
  }, [doc.reference_type, doc.reference_name]);

  const referenceItemRows = useMemo(
    () => referenceItemsState.key === referenceKey
      ? referenceItemsState.rows
      : EMPTY_REFERENCE_ITEMS,
    [referenceItemsState, referenceKey],
  );
  const referenceItemsLoading = Boolean(referenceKey) && referenceItemsState.key !== referenceKey;
  const referenceItemsError = referenceItemsState.key === referenceKey && referenceItemsState.error;

  const referenceItemCodes = useMemo(
    () => [...new Set(referenceItemRows.map((row) => row.item_code).filter(Boolean))],
    [referenceItemRows],
  );
  const selectedReferenceItemRows = useMemo(
    () => referenceItemRows.filter((row) => row.item_code === doc.item_code),
    [referenceItemRows, doc.item_code],
  );
  const availableBatches = useMemo(
    () => [...new Set([
      ...selectedReferenceItemRows.map((row) => row.batch_no).filter(Boolean),
      doc.batch_no,
    ])].filter(Boolean),
    [selectedReferenceItemRows, doc.batch_no],
  );
  const availableSerials = useMemo(
    () => [...new Set([
      ...selectedReferenceItemRows.flatMap((row) => splitSerialNumbers(row.serial_no)),
      doc.item_serial_no,
    ])].filter(Boolean),
    [selectedReferenceItemRows, doc.item_serial_no],
  );

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

  /**
   * Where the user is in the paper.
   *
   * 0 .. parameters.length - 1  ->  a question
   * parameters.length            ->  the review (the position AFTER the last
   *                                 question -- not a separate screen)
   */
  const [questionIndex, setQuestionIndex] = useState(0);

  /**
   * Is the details strip open?
   *
   * It opens on both new and existing inspections. It stays open until the
   * user collapses it (or starts a new inspection), so completing or editing
   * a field does not make the section disappear during the task.
   *
   * `FormSection` force-opens it when `errorCount` is set, so a failed Save
   * shows the field that is missing rather than leaving the user with a
   * message they cannot act on.
   */
  const [detailsOpen, setDetailsOpen] = useState(true);

  /** The rail, so a question change can scroll back to the top of it. */
  const railRef = useRef(null);

  /**
   * Which questions have their remark box open.
   *
   * A remark is the exception, not the rule -- one textarea per question
   * added a full extra block to every card, and on a phone that was most of
   * the scrolling. So the box is behind a button.
   *
   * The state is a MAP, not a list: an entry of `false` means "explicitly
   * closed", which is different from "never touched" -- the latter falls
   * back to "open when the parameter already carries a remark", so a remark
   * saved on the server is never hidden.
   */
  const [remarkState, setRemarkState] = useState({});

  const toggleRemark = (index) =>
    setRemarkState((current) => ({
      ...current,
      [index]: !current[index],
    }));

  const changeRemark = (index, remark) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, i) =>
      i === index ? { ...parameter, remark } : parameter,
    ));
  };

  /**
   * Confirming a template change.
   *
   * Changing the template replaces the whole question set, so every answer
   * entered against the old one is thrown away. The user is asked first --
   * silently discarding fifteen readings would be unforgivable.
   */
  const [confirmTemplate, setConfirmTemplate] = useState(null);

  /* ================= CALC ================= */
  // `parameterStatus`, `isParameterComplete` and `overallStatus` live in
  // lib/inspectionProgress.js. They are business rules that fail SILENTLY --
  // a user who has filled in every reading taps Submit and nothing happens
  // except a message several screens above the button -- so the rules suite
  // asserts them there, and the form has one source of truth for them.
  const updateReading = (pi, vi, value) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) => {
      if (index !== pi) return parameter;
      const next = { ...parameter, values: [...parameter.values] };
      next.values[vi] = value;
      next.status = isFormulaResponse(next.responseConfig)
        ? "Pending"
        : parameterStatus(next);
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
        : parameterStatus(next);
      return next;
    }));
  };

  const setManualStatus = (pi, status) => {
    setDirty(true);
    setParameters((current) => current.map((parameter, index) =>
      index === pi ? { ...parameter, manualStatus: status, status } : parameter,
    ));
  };

  /* ================= RESULT ================= */
  const overallStatus = computeOverallStatus(parameters);

  /**
   * Are the inspection's details complete?
   *
   * These are the fields ERPNext marks `reqd` on the doctype
   * (`quality_inspection.json`: item_code, inspection_type, reference_type,
   * reference_name, sample_size) plus the template, which the SPA requires.
   *
   * Until they are all there the inspection cannot be saved, and the
   * readings cannot be judged -- the item and the reference are what the
   * readings are about. So the paper WAITS: the details strip holds the
   * screen until the header is done, and only then does the inspection
   * become the work.
   */
  /**
   * The details that are still missing.
   *
   * `requiredFields` is the same helper the Save button uses, so "Start
   * inspection" and Save agree on what complete means. These are the fields
   * ERPNext marks `reqd` on the doctype (`quality_inspection.json`:
   * item_code, inspection_type, reference_type, reference_name, sample_size)
   * plus the template, which the SPA requires.
   */
  const detailsErrors = useMemo(
    () => {
      const errors = requiredFields(
        doc,
        {
          template: t("quality.template"),
          item_code: t("quality.item"),
          inspection_type: t("quality.inspectionType"),
          reference_type: t("quality.referenceType"),
          reference_name: t("quality.referenceName"),
          sample_size: t("quality.sampleSize"),
        },
        t,
      );
      Object.assign(errors, getConfiguredFieldErrors(doc, additionalFields, t));
      return errors;
    },
    [additionalFields, doc, t],
  );

  /**
   * Are the details complete?
   *
   * Until they are, the inspection cannot be saved, and the readings cannot
   * be judged -- the item and the reference are what the readings are about.
   * So the paper WAITS: the details strip holds the screen until the header
   * is done, and only then does the inspection become the work.
   */
  const detailsComplete = Object.keys(detailsErrors).length === 0;

  /**
   * Begin the inspection.
   *
   * If the details are not complete, the missing ones are marked and the
   * first is focused -- the same thing Save does, rather than a button that
   * silently does nothing.
   */
  const startInspection = () => {
    const missing = Object.keys(detailsErrors);
    if (missing.length) {
      setFieldErrors((prev) => ({ ...prev, ...detailsErrors }));
      // The summary states the SITUATION; the field carries the message.
      // Repeating "Template is required" in the banner AND under the field
      // says the same sentence twice on the same screen.
      requestAnimationFrame(() => focusFirstError(detailsErrors));
      return;
    }
    setFieldErrors({});
    setDetailsOpen(false);
  };


  /**
   * The counts the rail shows, and the state of every question.
   */
  const progress = useMemo(() => summariseInspection(parameters), [parameters]);
  const states = useMemo(() => questionStates(parameters), [parameters]);

  /* ================= THE WALK ================= */

  /**
   * Go to a question (or to the review, which is `parameters.length`).
   *
   * The page scrolls back to the rail so the next question is the first thing
   * on screen. `scrollIntoView` on the rail -- NOT `window.scrollTo`: the
   * scroll container is the app's `<main>`, not the window, so a
   * `window.scrollTo` would do nothing at all.
   */
  const goTo = (index) => {
    setQuestionIndex(index);
    requestAnimationFrame(() => {
      railRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToNext = () => {
    if (questionIndex < parameters.length - 1) goTo(questionIndex + 1);
    else goTo(parameters.length);
  };

  const goToPrevious = () => {
    if (questionIndex > 0) goTo(questionIndex - 1);
  };

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
    updateDoc({
      reference_type,
      reference_name: "",
      item_code: "",
      item_serial_no: "",
      batch_no: "",
    });
    setFieldErrors((prev) => ({ ...prev, reference_type: "", reference_name: "" }));
  };

  const handleReferenceNameChange = (reference_name) => {
    updateDoc({
      reference_name,
      item_code: "",
      item_serial_no: "",
      batch_no: "",
    });
    setFieldErrors((prev) => ({ ...prev, reference_name: "", item_code: "" }));
  };

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    const [res, fieldConfig] = await Promise.all([
      get(`resource/Quality Inspection/${name}`),
      getMethod(ADDITIONAL_FIELDS_METHOD).catch(() => {
        toast.error(t("quality.additionalFieldsLoadFailed"));
        return { catalog: [] };
      }),
    ]);
    const d = res.data;
    const configured = (fieldConfig.catalog || [])
      .filter((field) => field.enabled)
      .sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
    setAdditionalFields(configured);

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
      item_serial_no: d.item_serial_no || "",
      batch_no: d.batch_no || "",
      sample_size: d.sample_size ?? DEFAULT_SAMPLE_SIZE,
      remarks: d.remarks || "",
      docstatus: d.docstatus ?? 0,
      ...Object.fromEntries(configured.map((field) => [
        field.fieldname,
        configuredFieldValue(field, d[field.fieldname]),
      ])),
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
      parameter.status = parameterStatus(parameter);
      if (isFormulaResponse(responseConfig)) {
        parameter.status = existing?.status || "Pending";
      }
      return parameter;
    });

    setParameters(merged);
  };

  /* ================= TEMPLATE LOAD ================= */

  /**
   * Load a template's questions.
   *
   * Separated from the change handler because the change handler may ASK
   * first: picking a template replaces the whole question set, so every
   * answer entered against the old one goes with it.
   */
  const loadTemplate = async (template) => {
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
    setQuestionIndex(0);
    setRemarkState({});
    // The strip does NOT close here. Picking a template is one of five
    // details, not the hand-off -- the strip closes when they are ALL filled
    // (see the hand-off effect), because until then the inspection cannot be
    // saved and the readings would be answers to a half-configured document.
  };

  const handleTemplateChange = (template) => {
    if (!template) {
      updateDoc({ template: "" });
      setParameters([]);
      setQuestionIndex(0);
      return;
    }
    // Only ask when there is something to lose.
    if (parameters.length && parameters.some((p) => isParameterComplete(p))) {
      setConfirmTemplate(template);
      return;
    }
    loadTemplate(template);
  };

  const applyTemplateChange = async () => {
    const template = confirmTemplate;
    setConfirmTemplate(null);
    if (template) await loadTemplate(template);
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

  const getIncompleteParameters = () =>
    incompleteParameters(parametersRef.current);

  /*
   * Save and Submit have OPPOSITE conditions and must not share one `if` --
   * the same correction made on the Plate Offcut form.
   */
  const canSave = !doc.docstatus && (dirty || !isEdit);
  // Submit is offered once there is a paper to submit. An inspection with no
  // questions is not an inspection, and `handleSubmit` would happily create
  // one.
  const canSubmit = !doc.docstatus && parameters.length > 0;

  /**
   * The posted document. One builder, shared by Save and Submit.
   *
   * It used to be inlined in the save handler, which left nothing for Submit
   * to reuse -- so Submit was given its own copy, drifted, and ended up
   * omitting the four mandatory header fields.
   */
  const payloadFrom = (current) => ({
    item_code: current.item_code,
    item_serial_no: current.item_serial_no || "",
    batch_no: current.batch_no || "",
    quality_inspection_template: current.template,
    // Mandatory on the doctype. Omitting them produced
    // `MandatoryError: [Quality Inspection, ...]: inspection_type,
    // reference_type, reference_name, sample_size`.
    inspection_type: current.inspection_type,
    reference_type: current.reference_type,
    reference_name: current.reference_name,
    sample_size: Number(current.sample_size) || DEFAULT_SAMPLE_SIZE,
    remarks: current.remarks || "",
    ...Object.fromEntries(additionalFields.map((field) => [
      field.fieldname,
      configuredFieldValue(field, current[field.fieldname]),
    ])),
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
    Object.assign(errs, getConfiguredFieldErrors(current, additionalFields, t));
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      // No banner under the fields: the message is already on the field, and
      // the strip force-opens on the error count so it is right there.
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }

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
      // The document is on the server now, so the in-progress paper is no
      // longer the place to come back to.
      clearInspectionDraft();
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
      // A TOAST, not a banner: the Submit button is in the fixed bottom
      // toolbar, so the toast appears where the user just pressed, and the
      // jump takes them to the reading that is actually missing. A message
      // at the top of the page would be several screens above the button --
      // "nothing happened" is exactly what they would see.
      toast.error(t("quality.completeAllParameters"));
      const list = parametersRef.current;
      const firstIncomplete = list.findIndex(
        (parameter) => !isParameterComplete(parameter),
      );
      if (firstIncomplete >= 0) goTo(firstIncomplete);
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
    Object.assign(errs, getConfiguredFieldErrors(current, additionalFields, t));
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      // No banner under the fields: the message is already on the field, and
      // the strip force-opens on the error count so it is right there.
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }

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
      clearInspectionDraft();
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
    // The verdict, in the top bar, so it is visible from anywhere on the page.
    // The tone follows the app's document-badge convention, while the
    // READINGS use the module's own (a pending reading is a normal state, and
    // is deliberately not amber).
    const status = overallStatus
      ? {
          label:
            overallStatus === "Accepted"
              ? t("quality.statusAccepted")
              : overallStatus === "Rejected"
                ? t("quality.statusRejected")
                : t("quality.statusPending"),
          tone:
            overallStatus === "Accepted"
              ? "complete"
              : overallStatus === "Rejected"
                ? "danger"
                : "open",
        }
      : null;

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

      status,

      // A submitted Quality Inspection is READ-ONLY in ERPNext (docstatus 1,
      // allow_on_submit is not set on any editable field here). Offering Save
      // and Submit on one is not just misleading -- Save would be rejected by
      // the server, and the user would have no way to tell that from a real
      // save.
      //
      // SUBMIT IS IN THE TOOLBAR, not only in the review's content.
      //
      // The toolbar is a FIXED bottom bar, so an action in it cannot be
      // scrolled away -- and on a phone a button at the bottom of a long
      // page is exactly the one that goes missing. The review also offers
      // Submit in its content, because that is the obvious next step on a
      // desk, but the toolbar is the GUARANTEE: it is reachable from any
      // scroll position, on any screen.
      //
      // `handleSubmit` saves first and then submits, so it is safe to offer
      // while the document still has unsaved changes -- and it refuses (and
      // jumps to the first missing reading) when the paper is incomplete.
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
          onClick: handleSubmit,
          disabled: saving,
        },

        // Any saved inspection, draft or submitted: a defect photo belongs with
        // the inspection whether or not the readings are final, and submitted is
        // the case the report page's attach used to serve.
        //
        // Two branches, because the DIALOG differs: a document that has never
        // been saved has no name to attach to yet, so it opens the
        // "required attachment" dialog and the file is uploaded with the
        // first save; a saved one opens the normal attach dialog.
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
  }, [isEdit, doc, initialAttachment, overallStatus, parameters.length]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    if (isEdit) {
      // loadDoc only setStates after awaited API responses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    } else {
      getMethod(ADDITIONAL_FIELDS_METHOD)
        .then((result) => {
          const configured = (result.catalog || [])
            .filter((field) => field.enabled)
            .sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
          setAdditionalFields(configured);
          setDoc((current) => ({
            ...current,
            ...Object.fromEntries(configured.map((field) => [
              field.fieldname,
              configuredFieldValue(field, current[field.fieldname]),
            ])),
          }));
        })
        .catch(() => toast.error(t("quality.additionalFieldsLoadFailed")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= THE DRAFT ================= */
  // The in-progress paper, kept outside React so it survives the user walking
  // away to the list and coming back. See lib/inspectionDraft.js for why it
  // is not a context.

  useEffect(() => {
    // A saved document is the server's business; only an UNSAVED paper is
    // worth keeping.
    if (isEdit) return;
    // Nothing started yet -- there is no paper to come back to.
    if (!parameters.length && !doc.template) return;

    setInspectionDraft({
      doc: { ...doc },
      parameters,
      questionIndex,
      savedAt: Date.now(),
    });
  }, [doc, parameters, questionIndex, isEdit]);

  useEffect(() => {
    // Restore the paper, ONCE, on a new inspection.
    //
    // This runs BEFORE the effect above, so the draft is never briefly
    // overwritten with an empty one: the guard there ("nothing started yet")
    // stops it writing at all until the template is back in place.
    //
    // A report row is a deliberate new inspection, so an old draft must not
    // overwrite its item/serial/batch prefill. The draft is left in place
    // until this paper is saved; nothing is silently discarded.
    if (isEdit || hasPrefill) return;
    const draft = getInspectionDraft();
    if (!draft) return;

    // This is the "sync with an external system" case the rule is about:
    // the draft store is outside React, and reading it back in is a one-off
    // on mount, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoc((current) => ({ ...current, ...draft.doc }));
    setParameters(draft.parameters || []);
    setQuestionIndex(draft.questionIndex ?? 0);
    // Keep the details section open while restoring the draft; the user can
    // collapse it once they are ready to work through the inspection.
    setDirty(true);
  }, [hasPrefill, isEdit]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* THE DETAILS
          A collapsible strip, not a screen. It starts open and remains open
          until the user collapses it. On a new inspection, Start inspection
          also closes it as the intentional hand-off to the readings.

          `errorCount` force-opens it, so a Save that failed on a missing
          reference shows the field that is missing rather than leaving the
          user with a message they cannot act on. */}
      <FormSection
        className="mb-3"
        title={t("quality.inspectionDetails")}
        icon={ClipboardList}
        collapsible={!isEdit}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        errorCount={countErrors(fieldErrors)}
        action={
          !detailsOpen ? (
            <span className="truncate text-xs text-muted-foreground">
              {/* The summary says what is still missing, not what happens to
                  be filled in -- a collapsed strip showing an item while the
                  type and the reference are empty reads as "done". */}
              {detailsComplete
                ? [doc.item_code, doc.reference_name].filter(Boolean).join(" · ")
                : t("quality.detailsNeeded")}
            </span>
          ) : null
        }
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
              options={INSPECTION_TYPES.map((it) => [it.value, t(it.labelKey)])}
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
              onChange={handleReferenceNameChange}
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
            label={t("quality.item")}
            error={fieldErrors.item_code}
            required
          >
            <LinkField
              doctype="Item"
              value={doc.item_code}
              onChange={(v) => updateDoc({ item_code: v, item_serial_no: "", batch_no: "" })}
              disabled={Boolean(doc.docstatus) || !doc.reference_name || referenceItemsLoading || !referenceItemCodes.length}
              filters={doc.reference_name ? { name: ["in", referenceItemCodes] } : undefined}
            />
            {doc.reference_name && !referenceItemsLoading && !referenceItemCodes.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(referenceItemsError ? "quality.referenceItemsLoadFailed" : "quality.noItemsForReference")}
              </p>
            ) : null}
          </FormField>

          {availableBatches.length ? (
            <FormField label={t("quality.batchNo")}>
              <FormSelect
                value={doc.batch_no}
                onChange={(batch_no) => updateDoc({ batch_no })}
                disabled={Boolean(doc.docstatus)}
                placeholder={t("quality.selectBatch")}
                options={availableBatches.map((batch) => [batch, batch])}
              />
            </FormField>
          ) : null}

          {availableSerials.length ? (
            <FormField label={t("quality.serialNo")}>
              <FormSelect
                value={doc.item_serial_no}
                onChange={(item_serial_no) => updateDoc({ item_serial_no })}
                disabled={Boolean(doc.docstatus)}
                placeholder={t("quality.selectSerial")}
                options={availableSerials.map((serial) => [serial, serial])}
              />
            </FormField>
          ) : null}

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

          {additionalFields.map((field) => {
            const value = doc[field.fieldname] ?? configuredFieldDefault(field);
            const disabled = Boolean(doc.docstatus);
            let control;
            if (field.fieldtype === "Check") {
              control = (
                <div className="flex h-8 items-center">
                  <Checkbox
                    checked={Boolean(value)}
                    disabled={disabled}
                    onCheckedChange={(checked) => updateDoc({ [field.fieldname]: checked === true ? 1 : 0 })}
                  />
                </div>
              );
            } else if (field.fieldtype === "Link") {
              control = (
                <LinkField
                  doctype={field.options}
                  value={value}
                  disabled={disabled}
                  onChange={(next) => updateDoc({ [field.fieldname]: next })}
                />
              );
            } else if (field.fieldtype === "Select") {
              control = (
                <FormSelect
                  value={value}
                  disabled={disabled}
                  onChange={(next) => updateDoc({ [field.fieldname]: next })}
                  placeholder={t("quality.selectAdditionalField", { label: field.label })}
                  options={String(field.options || "").split(/\r?\n/).filter(Boolean).map((option) => [option, option])}
                />
              );
            } else if (["Small Text", "Text"].includes(field.fieldtype)) {
              control = (
                <Textarea
                  value={value}
                  disabled={disabled}
                  onChange={(event) => updateDoc({ [field.fieldname]: event.target.value })}
                />
              );
            } else {
              const inputType = {
                Date: "date",
                Datetime: "datetime-local",
                Time: "time",
                Int: "number",
                Float: "number",
                Currency: "number",
                Percent: "number",
              }[field.fieldtype] || "text";
              control = (
                <Input
                  type={inputType}
                  step={field.fieldtype === "Int" ? "1" : inputType === "number" ? "any" : undefined}
                  value={value}
                  disabled={disabled}
                  onChange={(event) => updateDoc({ [field.fieldname]: event.target.value })}
                />
              );
            }
            return (
              <FormField
                key={field.fieldname}
                name={field.fieldname}
                label={field.label}
                required={field.required_by_doctype || field.mandatory}
                error={fieldErrors[field.fieldname]}
              >
                {control}
              </FormField>
            );
          })}

          {/* START INSPECTION
              A NEW inspection is closed BY HAND. The last field being filled
              is not the user saying "the header is done" -- and a strip that
              vanishes under them mid-edit is worse than one they close
              themselves. So the button is the hand-off.

              Clicking it with a detail still missing marks the missing ones
              and focuses the first, exactly as Save does, rather than
              silently doing nothing. */}
          {!isEdit ? (
            <div className="flex justify-end md:col-span-2">
              <Button
                type="button"
                variant="default"
                onClick={startInspection}
                disabled={Boolean(doc.docstatus)}
              >
                {t("quality.startInspection")}
              </Button>
            </div>
          ) : null}
      </FormSection>


      {/* THE RAIL
          One chip per question, plus one for the review. The whole point is
          that the user never has to scroll to find their place, and that
          every question is one tap away.

          It waits for the details: the rail is the paper's navigation, and
          the paper is not the work until the header is done. */}
      {detailsComplete && parameters.length > 0 && (
        <QuestionRail
          railRef={railRef}
          parameters={parameters}
          states={states}
          current={questionIndex}
          remaining={progress.remaining}
          onSelect={goTo}
        />
      )}

      {/* THE PAPER
          One question at a time, or the review -- the position AFTER the
          last question, not a separate screen.

          It waits for the details. The header is not a preamble: the item
          and the reference are what the readings are about, and until they
          are there the inspection cannot be saved at all. So the details
          hold the screen, and the paper arrives with the hand-off. */}
      {!detailsComplete ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {doc.template
            ? t("quality.completeDetailsFirst")
            : t("quality.noParametersYet")}
        </p>
      ) : parameters.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("quality.noParametersYet")}
        </p>
      ) : questionIndex >= parameters.length ? (
        <InspectionReview
          parameters={parameters}
          states={states}
          progress={progress}
          overallStatus={overallStatus}
          remarks={doc.remarks}
          onRemarksChange={(remarks) => updateDoc({ remarks })}
          onJump={goTo}
          onBack={() => goTo(parameters.length - 1)}
          onSubmit={handleSubmit}
          saving={saving}
          disabled={Boolean(doc.docstatus)}
        />
      ) : (
        <InspectionQuestion
          key={questionIndex}
          parameter={parameters[questionIndex]}
          index={questionIndex}
          status={parameterStatus(parameters[questionIndex])}
          disabled={Boolean(doc.docstatus)}
          remarkOpen={remarkState[questionIndex] ?? Boolean(parameters[questionIndex].remark)}
          onToggleRemark={() => toggleRemark(questionIndex)}
          onRemarkChange={(remark) => changeRemark(questionIndex, remark)}
          onReadingChange={(vi, value) => updateReading(questionIndex, vi, value)}
          onReadingValueChange={(value) => updateReadingValue(questionIndex, value)}
          onManualStatusChange={(status) => setManualStatus(questionIndex, status)}
          onNext={goToNext}
          onPrevious={goToPrevious}
          isFirst={questionIndex === 0}
          isLast={questionIndex === parameters.length - 1}
        />
      )}

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

      {/* Changing the template throws away every answer entered against the
          old one. The user is asked first -- silently discarding fifteen
          readings would be unforgivable. */}
      <ConfirmDialog
        open={Boolean(confirmTemplate)}
        onCancel={() => setConfirmTemplate(null)}
        onConfirm={applyTemplateChange}
        variant="default"
        title={t("quality.changeTemplateTitle")}
        message={t("quality.changeTemplateWarning")}
        confirmLabel={t("quality.changeTemplateAnyway")}
      />
    </div>
  );
}
