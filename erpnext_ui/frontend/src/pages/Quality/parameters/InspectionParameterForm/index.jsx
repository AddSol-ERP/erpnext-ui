import { useEffect, useState } from "react";
import { ClipboardList, FileText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import { focusFirstError } from "../../../../lib/formValidation";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function InspectionParameterForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    parameter: "",
    parameter_group: "",
    description: "",
  });

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    try {
      setLoading(true);
      const res = await get(`resource/Quality Inspection Parameter/${name}`);

      setDoc({
        parameter: res.data.parameter || "",
        parameter_group: res.data.parameter_group || "",
        description: res.data.description || "",
      });
    } catch (e) {
      console.error(e);
      toast.error(t("quality.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const errs = {};
    if (!doc.parameter) {
      errs.parameter = t("quality.parameterRequired");
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

      if (name) {
        await post(`resource/Quality Inspection Parameter/${name}`, doc);
      } else {
        await post("resource/Quality Inspection Parameter", doc);
      }

      toast.success(t("quality.savedSuccess"));
      navigate("/quality/parameters");
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
        ? t("quality.parameterTitle", { name: doc.name || "" })
        : t("quality.newParameter"),

      subtitle: name
        ? t("quality.parameterEditSubtitle")
        : t("quality.parameterNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        {
          label: t("quality.inspectionParameters"),
          path: "/quality/parameters",
        },
        {
          label: name ? doc.name || t("common.edit") : t("common.new"),
        },
      ],

      actions: [
        {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          disabled: loading,
          onClick: handleSave,
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
      <FormSection title={t("quality.basicDetails")} icon={ClipboardList}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label={t("quality.parameter")}
            required
            name="parameter"
            error={fieldErrors.parameter}
          >
            <Input
              value={doc.parameter}
              onChange={(e) => setDoc({ ...doc, parameter: e.target.value })}
            />
          </FormField>

          <FormField label={t("quality.parameterGroup")} name="parameter_group">
            <LinkField
              doctype="Quality Inspection Parameter Group"
              value={doc.parameter_group}
              onChange={(v) => setDoc({ ...doc, parameter_group: v })}
            />
          </FormField>
        </div>
      </FormSection>

      {/* DESCRIPTION */}
      <FormSection title={t("quality.description")} icon={FileText}>
        <FormField label={t("quality.description")} name="description">
          <Textarea
            rows={4}
            value={doc.description || ""}
            onChange={(e) => setDoc({ ...doc, description: e.target.value })}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
