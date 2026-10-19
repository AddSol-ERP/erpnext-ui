import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import { get } from "../../../../services/api";
import { saveDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import { ClipboardList } from "lucide-react";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { gridCorners } from "../../../../lib/gridCorners";
import FormSelect from "../../../../components/FormSelect";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import {
  errorList,
  focusFirstError,
  requiredFields,
} from "../../../../lib/formValidation";

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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
  const updateReading = (pi, vi, value) => {
    const updated = [...parameters];
    const p = updated[pi];

    p.values[vi] = value;

    const nums = p.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v));

    if (nums.length === 0) {
      p.status = "Pending";
      setParameters(updated);
      return;
    }

    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const target = (p.min_value + p.max_value) / 2;
    const deviation = Math.abs((avg - target) / target) * 100;

    p.avg = avg.toFixed(2);
    p.deviation = deviation.toFixed(2);

    if (deviation <= p.tolerance) {
      p.status = "PASS";
    } else {
      p.status = "FAIL";
    }

    setParameters(updated);
  };

  /* ================= RESULT ================= */
  const overallStatus = (() => {
    if (!parameters.length) return "";

    if (parameters.some((p) => p.status === "Pending")) return "Pending";

    if (parameters.some((p) => p.status === "FAIL")) return "Rejected";

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
    setDoc({ ...doc, reference_type, reference_name: "" });
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

      return {
        parameter: t.specification,
        numeric: t.numeric,
        min_value: t.min_value,
        max_value: t.max_value,
        tolerance: 5, // default %
        values: [
          existing?.reading_1,
          existing?.reading_2,
          existing?.reading_3,
        ].filter((v) => v) || [""],
        status: existing?.status || "Pending",
        avg: 0,
        deviation: 0,
      };
    });

    setParameters(merged);
  };

  /* ================= TEMPLATE LOAD ================= */
  const handleTemplateChange = async (template) => {
    setDoc({ ...doc, template });

    const res = await get(`resource/Quality Inspection Template/${template}`);

    const rows = res.data.item_quality_inspection_parameter || [];

    const mapped = rows.map((r) => ({
      parameter: r.specification,
      numeric: r.numeric,
      min_value: r.min_value,
      max_value: r.max_value,
      tolerance: 5,
      values: [""],
      status: "Pending",
      avg: 0,
      deviation: 0,
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

  const handleSave = async () => {
    const current = docRef.current;
    const payload = {
      item_code: current.item_code,
      quality_inspection_template: current.template,
      // Mandatory on the doctype. Omitting them produced
      // `MandatoryError: [Quality Inspection, ...]: inspection_type,
      // reference_type, reference_name, sample_size`.
      inspection_type: current.inspection_type,
      reference_type: current.reference_type,
      reference_name: current.reference_name,
      sample_size: Number(current.sample_size) || DEFAULT_SAMPLE_SIZE,
      status: overallStatusRef.current,
      readings: parametersRef.current.map((p) => ({
        specification: p.parameter,
        reading_1: p.values[0] || "",
        reading_2: p.values[1] || "",
        reading_3: p.values[2] || "",
        status: p.status,
      })),
    };

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

      actions: [
        {
          label: t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
          // Stops a double-submit: two POSTs would create two Quality
          // Inspections, and the second would collide on the naming series
          // with an error the user cannot connect to the first click.
          disabled: saving,
        },

        isEdit &&
          !doc.docstatus && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, doc]);

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
              onChange={(v) => setDoc({ ...doc, item_code: v })}
            />
          </FormField>

          <FormField
            label={t("quality.inspectionType")}
            error={fieldErrors.inspection_type}
            required
          >
            <FormSelect
              value={doc.inspection_type}
              onChange={(v) => {
                setDoc({ ...doc, inspection_type: v });
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
                setDoc({ ...doc, reference_name: v });
                setFieldErrors((p) => ({ ...p, reference_name: "" }));
              }}
              disabled={!doc.reference_type}
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
              onChange={(e) => {
                setDoc({ ...doc, sample_size: e.target.value });
                setFieldErrors((p) => ({ ...p, sample_size: "" }));
              }}
            />
          </FormField>
      </FormSection>

      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* PARAMETERS */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {parameters.map((p, i) => (
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

              <div className="mb-2 text-center text-sm text-muted-foreground">
                {t("quality.rangeTolerance", {
                  min: p.min_value,
                  max: p.max_value,
                  tol: p.tolerance,
                })}
              </div>

              {/* INPUTS */}
              {p.values.map((val, vi) => (
                <Input
                  key={vi}
                  className="mb-2 text-center"
                  type="number"
                  value={val}
                  placeholder={t("quality.reading", { n: vi + 1 })}
                  onChange={(e) => updateReading(i, vi, e.target.value)}
                />
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const updated = [...parameters];
                  updated[i].values.push("");
                  setParameters(updated);
                }}
              >
                + {t("quality.addReading")}
              </Button>

              {/* METRICS */}
              {p.avg > 0 && (
                <div className="mt-3 text-center text-sm">
                  <div>
                    {t("quality.avg")}: <b>{p.avg}</b>
                  </div>
                  <div>
                    {t("quality.dev")}:{" "}
                    <b
                      className={
                        p.deviation > p.tolerance
                          ? "text-destructive"
                          : "text-emerald-600"
                      }
                    >
                      {p.deviation}%
                    </b>
                  </div>
                </div>
              )}

              {/* STATUS */}
              <div className="mt-2 text-center">
                <Badge
                  variant="outline"
                  className={
                    p.status === "PASS"
                      ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                      : p.status === "FAIL"
                        ? "bg-destructive/15 text-destructive ring-destructive/30"
                        : "bg-muted text-muted-foreground ring-border"
                  }
                >
                  {p.status === "PASS"
                    ? t("quality.statusPass")
                    : p.status === "FAIL"
                      ? t("quality.statusFail")
                      : t("quality.statusPending")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FINAL RESULT */}
      <Card className="mt-3">
        <CardContent className="p-4 text-center">
          <div className="text-sm text-muted-foreground">
            {t("quality.finalResult")}
          </div>
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
    </div>
  );
}
