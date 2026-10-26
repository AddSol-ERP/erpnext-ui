import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Save, Settings2, Warehouse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useHeader } from "../../../context/HeaderContext";
import { useToast } from "../../../context/ToastContext";
import FormSection from "../../../components/FormSection";
import LinkField from "../../../components/LinkField";
import { getMethod, post } from "../../../services/api";

const GET_METHOD = "method/erpnext_ui.quality_inspection.get_quality_inspection_field_config";
const SAVE_METHOD = "method/erpnext_ui.quality_inspection.save_quality_inspection_field_config";

export default function QualityInspectionSettings() {
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const toast = useToast();
  const [fields, setFields] = useState([]);
  const [pendingWarehouse, setPendingWarehouse] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const saveRef = useRef(() => {});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMethod(GET_METHOD);
      setFields(result.catalog || []);
      setPendingWarehouse(result.pending_inspection_warehouse || "");
      setDirty(false);
    } catch (reason) {
      setError(reason.message || t("quality.additionalFieldsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateWarehouse = (next) => {
    setPendingWarehouse(next);
    setDirty(true);
    setError("");
  };

  const update = (fieldname, patch) => {
    setFields((current) => current.map((field) =>
      field.fieldname === fieldname ? { ...field, ...patch } : field,
    ));
    setDirty(true);
    setError("");
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await post(SAVE_METHOD, {
        payload: JSON.stringify(fields.map((field) => ({
          fieldname: field.fieldname,
          enabled: field.enabled,
          mandatory: field.mandatory,
          display_order: field.display_order,
        }))),
        pending_inspection_warehouse: pendingWarehouse,
      });
      toast.success(t("quality.settingsSaved"));
      await load();
    } catch (reason) {
      setError(reason.message || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [fields, load, pendingWarehouse, t, toast]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    setHeader({
      title: t("quality.additionalFieldsSettings"),
      subtitle: t("quality.additionalFieldsSettingsHint"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.additionalFieldsSettings") },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          icon: RefreshCw,
          disabled: loading || saving,
          onClick: load,
        },
        dirty && {
          label: saving ? t("common.saving") : t("common.save"),
          variant: "btn-primary",
          icon: Save,
          disabled: saving,
          onClick: () => saveRef.current(),
        },
      ].filter(Boolean),
    });
    return () => setHeader({});
  }, [dirty, load, loading, saving, setHeader, t]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <FormSection title={t("quality.pendingInspectionSection")} icon={Warehouse}>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("quality.pendingInspectionWarehouseHint")}
        </p>
        <div className="max-w-md space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            {t("quality.pendingInspectionWarehouse")}
          </label>
          <LinkField
            doctype="Warehouse"
            value={pendingWarehouse}
            onChange={updateWarehouse}
            filters={{ is_group: 0 }}
            placeholder={t("quality.pendingInspectionWarehouse")}
            disabled={loading}
          />
        </div>
      </FormSection>
      <FormSection title={t("quality.additionalFieldsSection")} icon={Settings2}>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("quality.additionalFieldsInstructions")}
        </p>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : fields.length ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("quality.additionalFieldLabel")}</th>
                  <th className="px-3 py-2">{t("quality.additionalFieldType")}</th>
                  <th className="px-3 py-2 text-center">{t("quality.additionalFieldVisible")}</th>
                  <th className="px-3 py-2 text-center">{t("quality.additionalFieldRequired")}</th>
                  <th className="w-28 px-3 py-2">{t("quality.additionalFieldOrder")}</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.fieldname} className="border-t border-border">
                    <td className="px-3 py-3">
                      <div className="font-medium">{field.label}</div>
                      <code className="text-xs text-muted-foreground">{field.fieldname}</code>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{field.fieldtype}</td>
                    <td className="px-3 py-3 text-center">
                      <Checkbox
                        checked={field.enabled}
                        onCheckedChange={(checked) => update(field.fieldname, { enabled: checked === true })}
                        aria-label={t("quality.toggleFieldVisible", { label: field.label })}
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Checkbox
                        checked={field.required_by_doctype || field.mandatory}
                        disabled={field.required_by_doctype || !field.enabled}
                        onCheckedChange={(checked) => update(field.fieldname, { mandatory: checked === true })}
                        aria-label={t("quality.toggleFieldRequired", { label: field.label })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={field.display_order}
                        disabled={!field.enabled}
                        onChange={(event) => update(field.fieldname, { display_order: event.target.value })}
                        aria-label={t("quality.fieldDisplayOrder", { label: field.label })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("quality.noAdditionalFields")}
          </div>
        )}
      </FormSection>
    </div>
  );
}
