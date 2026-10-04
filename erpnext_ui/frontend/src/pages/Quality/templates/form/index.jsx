import { useEffect, useRef, useState } from "react";
import { ClipboardList, ListChecks } from "lucide-react";
import { get } from "../../../../services/api";
import { saveDocument } from "../../../../lib/docTransition";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import LinkField from "../../../../components/LinkField";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import FormSelect from "../../../../components/FormSelect";
import { focusFirstError } from "../../../../lib/formValidation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function QualityTemplateForm() {
  const navigate = useNavigate();
  const { name } = useParams();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

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

  const mapRowFromERP = (r) => {
    if (r.formula_based_criteria) return { ...r, mode: "formula" };
    if (r.numeric) return { ...r, mode: "numeric" };
    return { ...r, mode: "value" };
  };

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Quality Inspection Template/${name}`);
      const data = res.data;

      setDoc({
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
    setDoc((prev) => ({
      ...prev,
      item_quality_inspection_parameter: [
        ...prev.item_quality_inspection_parameter,
        {
          specification: "",
          mode: "numeric",
          value: "",
          min_value: "",
          max_value: "",
          acceptance_formula: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    const rows = [...doc.item_quality_inspection_parameter];
    rows[i][field] = value;

    if (field === "mode") {
      rows[i].value = "";
      rows[i].min_value = "";
      rows[i].max_value = "";
      rows[i].acceptance_formula = "";
    }

    setDoc({ ...doc, item_quality_inspection_parameter: rows });
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
          let row = {
            doctype: "Item Quality Inspection Parameter",
            specification: r.specification,
          };

          if (r.mode === "numeric") {
            row.numeric = 1;
            row.min_value = r.min_value;
            row.max_value = r.max_value;
          }

          if (r.mode === "value") {
            row.numeric = 0;
            row.value = r.value;
          }

          if (r.mode === "formula") {
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

    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      const list = Object.values(errs);
      setError(list.length > 1 ? t("common.fixErrors") : list[0]);
      requestAnimationFrame(() => focusFirstError(errs));
      return;
    }

    setError("");
    try {
      setLoading(true);

      const payload = preparePayload();

      await saveDocument({
        doctype: "Quality Inspection Template",
        name: name || undefined,
        doc: payload,
      });

      toast.success(t("quality.savedSuccess"));
      navigate("/quality-templates");
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
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

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

      {/* PARAMETERS */}
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

        {doc.item_quality_inspection_parameter.map((row, idx) => (
          <div key={idx} className="rounded-lg border border-border p-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* PARAM */}
              <FormField label={t("quality.parameter")} required>
                <LinkField
                  doctype="Quality Inspection Parameter"
                  value={row.specification}
                  onChange={(v) => updateRow(idx, "specification", v)}
                />
              </FormField>

              {/* MODE */}
              <FormField label={t("quality.type")}>
                <FormSelect
                  value={row.mode}
                  onChange={(v) => updateRow(idx, "mode", v)}
                  options={[
                    ["numeric", t("quality.typeRange")],
                    ["value", t("quality.typeValue")],
                    ["formula", t("quality.typeFormula")],
                  ]}
                />
              </FormField>

              {/* REMOVE */}
              <div className="flex items-end justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  onClick={() => removeRow(idx)}
                >
                  {t("quality.remove")}
                </Button>
              </div>
            </div>

            {/* VALUE INPUTS */}
            <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
              {row.mode === "numeric" && (
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

              {row.mode === "value" && (
                <FormField label={t("quality.value")}>
                  <Input
                    value={row.value || ""}
                    onChange={(e) => updateRow(idx, "value", e.target.value)}
                  />
                </FormField>
              )}

              {row.mode === "formula" && (
                <div className="md:col-span-2">
                  <FormField label={t("quality.formula")}>
                    <Textarea
                      value={row.acceptance_formula || ""}
                      onChange={(e) =>
                        updateRow(idx, "acceptance_formula", e.target.value)
                      }
                    />
                  </FormField>
                </div>
              )}
            </div>
          </div>
        ))}
      </FormSection>
    </div>
  );
}
