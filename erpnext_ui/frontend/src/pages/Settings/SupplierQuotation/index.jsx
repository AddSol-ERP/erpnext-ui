import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ListChecks,
  Mail,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormSelect from "../../../components/FormSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useHeader } from "../../../context/HeaderContext";
import { useToast } from "../../../context/ToastContext";
import { get, getMethod, post } from "../../../services/api";

const SETTINGS_METHOD = "method/erpnext_ui.supplier_quotation";
const CATALOG_METHOD = `${SETTINGS_METHOD}.get_supplier_quotation_field_catalog`;
const SAVE_METHOD = `${SETTINGS_METHOD}.save_supplier_quotation_settings`;
const SYNC_METHOD = `${SETTINGS_METHOD}.sync_supplier_quotation_fields`;

const NUMERIC_FIELDS = new Set([
  "otp_expiry_minutes",
  "otp_max_attempts",
  "otp_resend_throttle_minutes",
  "invitation_expiry_days",
  "response_session_minutes",
  "max_suppliers_per_request",
]);

const SCALAR_DEFAULTS = {
  enabled: 1,
  brand_name: "",
  brand_color: "",
  invitation_subject: "",
  invitation_message: "",
  response_subject: "",
  response_message: "",
  supplier_acknowledgement_subject: "",
  supplier_acknowledgement_message: "",
  supplier_quotation_email_subject: "",
  supplier_quotation_email_message: "",
  supplier_acknowledgement_print_format: "Standard",
  attach_print_format: 1,
  default_print_format: "Standard",
  otp_expiry_minutes: 10,
  otp_max_attempts: 5,
  otp_resend_throttle_minutes: 2,
  invitation_expiry_days: 7,
  response_session_minutes: 60,
  max_suppliers_per_request: 20,
  enable_response_hooks: 1,
};

const SCOPES = [
  { key: "Item", label: "store.supplierQuotationSettings.scopeItem" },
  { key: "Document", label: "store.supplierQuotationSettings.scopeDocument" },
];

function toScalarForm(settings = {}) {
  const form = {};
  for (const key of Object.keys(SCALAR_DEFAULTS)) {
    form[key] = settings[key] ?? SCALAR_DEFAULTS[key];
  }
  return form;
}

function mergeCatalog(catalog, settings) {
  const saved = new Map(
    (settings.field_config || []).map((row) => [
      `${row.scope}:${row.fieldname}`,
      row,
    ]),
  );
  const rows = [];
  for (const scope of SCOPES) {
    const entries = catalog[scope.key === "Item" ? "item" : "document"] || [];
    for (const entry of entries) {
      const row = saved.get(`${scope.key}:${entry.fieldname}`) || {};
      rows.push({
        ...entry,
        scope: scope.key,
        enabled: Number(row.enabled ?? entry.default_enabled ?? 0),
        supplier_editable: Number(
          row.supplier_editable ?? entry.default_editable ?? 0,
        ),
        mandatory: Number(row.mandatory ?? entry.default_mandatory ?? 0),
        display_order: Number(row.display_order ?? entry.default_order ?? 0),
        help_text: row.help_text || "",
      });
    }
  }
  return rows;
}

/**
 * Settings for the supplier-quotation response flow.
 *
 * This screen writes through `save_supplier_quotation_settings`, not the generic
 * resource API: the browser only sends choices (which fields, wording, limits),
 * while labels, field types, options and eligibility stay derived from ERPNext
 * metadata on the server. Letting the client post a child row built by hand is
 * how a `Data` row becomes a `Table` row and the public form breaks silently.
 */
export default function SupplierQuotationSettings() {
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const toast = useToast();

  const [form, setForm] = useState(SCALAR_DEFAULTS);
  const [fields, setFields] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [materialRequestPrintFormats, setMaterialRequestPrintFormats] = useState([
    { value: "Standard", label: "Standard" },
  ]);
  const [acknowledgementPrintFormats, setAcknowledgementPrintFormats] = useState([
    { value: "Standard", label: "Standard" },
  ]);
  const [scope, setScope] = useState("Item");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const saveRef = useRef(() => {});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await getMethod(CATALOG_METHOD);
      setForm(toScalarForm(data.settings));
      setFields(mergeCatalog(data.catalog || {}, data.settings || {}));
      setRecipients(
        (data.settings?.response_recipients || []).map((row) => ({
          email: row.email || "",
          enabled: Number(row.enabled ?? 1),
        })),
      );
      setDirty(false);
    } catch (error) {
      setLoadError(
        error.message || t("store.supplierQuotationSettings.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPrintFormats = useCallback(async (doctype, setOptions) => {
    try {
      const response = await get("resource/Print Format", {
        filters: JSON.stringify({
          doc_type: doctype,
          disabled: 0,
        }),
        fields: JSON.stringify(["name"]),
        order_by: "name asc",
        limit_page_length: 100,
      });
      const formats = (response.data || []).map((row) => ({
        value: row.name,
        label: row.name,
      }));
      setOptions([
        { value: "Standard", label: "Standard" },
        ...formats.filter((row) => row.value !== "Standard"),
      ]);
    } catch {
      // The catalog is still editable without this list. Failing the whole
      // screen because a print format query was denied would hide the fields.
      setOptions([{ value: "Standard", label: "Standard" }]);
    }
  }, []);

  useEffect(() => {
    // The loaders own their own busy state; there is no external store to
    // subscribe to. The rule targets cascading render bugs, and this is the
    // page's initial fetch, not state synchronised from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadPrintFormats("Material Request", setMaterialRequestPrintFormats);
    loadPrintFormats("Supplier Quotation", setAcknowledgementPrintFormats);
  }, [load, loadPrintFormats]);

  const markDirty = () => {
    setDirty(true);
    setSaveError("");
  };

  const setScalar = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const updateField = (index, patch) => {
    setFields((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
    markDirty();
  };

  const updateRecipient = (index, patch) => {
    setRecipients((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
    markDirty();
  };

  const addRecipient = () => {
    setRecipients((current) => [...current, { email: "", enabled: 1 }]);
    markDirty();
  };

  const removeRecipient = (index) => {
    setRecipients((current) =>
      current.filter((_, rowIndex) => rowIndex !== index),
    );
    markDirty();
  };

  const rescan = async () => {
    try {
      setSaving(true);
      const result = await post(SYNC_METHOD);
      const message = result.message || {};
      toast.success(
        t("store.supplierQuotationSettings.rescanned", {
          added: message.added || 0,
          updated: message.updated || 0,
        }),
      );
      await load();
    } catch (error) {
      toast.error(
        error.message || t("store.supplierQuotationSettings.rescanFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const payload = {};
    for (const key of Object.keys(SCALAR_DEFAULTS)) {
      const value = form[key];
      payload[key] = NUMERIC_FIELDS.has(key)
        ? Number(value || 0)
        : (value ?? "");
    }

    payload.field_config = fields.map((row) => ({
      scope: row.scope,
      fieldname: row.fieldname,
      enabled: Number(Boolean(row.enabled)),
      supplier_editable: Number(Boolean(row.supplier_editable)),
      mandatory: Number(Boolean(row.mandatory)),
      display_order: Number(row.display_order || 0),
      help_text: row.help_text || "",
    }));

    payload.response_recipients = recipients
      .map((row) => ({
        email: String(row.email || "").trim(),
        enabled: Number(Boolean(row.enabled)),
      }))
      .filter((row) => row.email);

    setSaving(true);
    setSaveError("");
    try {
      await post(SAVE_METHOD, { payload: JSON.stringify(payload) });
      toast.success(t("store.supplierQuotationSettings.saved"));
      await load();
    } catch (error) {
      setSaveError(
        error.message || t("store.supplierQuotationSettings.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    saveRef.current = handleSave;
  });

  useEffect(() => {
    setHeader({
      title: t("store.supplierQuotationSettings.title"),
      subtitle: t("store.supplierQuotationSettings.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.supplierQuotationSettings.title") },
      ],
      actions: [
        {
          label: t("store.supplierQuotationSettings.rescan"),
          variant: "btn-outline-primary",
          onClick: rescan,
          disabled: loading || saving,
        },
        {
          label: saving ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: () => saveRef.current(),
          disabled: loading || saving || !dirty,
        },
      ],
    });

    return () => setHeader({});
    // rescan reads the current form only through the reload that follows it, so
    // it does not need to be re-registered when a checkbox changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, saving, dirty, t, setHeader]);

  const visibleFields = fields.filter((row) => {
    if (row.scope !== scope) return false;
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (
      row.fieldname.toLowerCase().includes(needle) ||
      row.label.toLowerCase().includes(needle)
    );
  });

  const editableCount = fields.filter(
    (row) => row.enabled && row.supplier_editable,
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 pt-4">
      {loadError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {t("store.supplierQuotationSettings.loadFailed")}
            </p>
            <p className="text-xs">{loadError}</p>
          </div>
        </div>
      ) : null}

      {saveError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      ) : null}

      <FormSection
        title={t("store.supplierQuotationSettings.generalTitle")}
        description={t("store.supplierQuotationSettings.generalHint")}
        icon={Settings2}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 md:col-span-2">
          <span>
            <span className="block text-sm font-medium">
              {t("store.supplierQuotationSettings.enabled")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("store.supplierQuotationSettings.enabledHint")}
            </span>
          </span>
          <Switch
            checked={Boolean(form.enabled)}
            onCheckedChange={(checked) => setScalar("enabled", checked ? 1 : 0)}
          />
        </label>

        <FormField label={t("store.supplierQuotationSettings.brandName")}>
          <Input
            value={form.brand_name}
            onChange={(event) => setScalar("brand_name", event.target.value)}
            placeholder={t(
              "store.supplierQuotationSettings.brandNamePlaceholder",
            )}
          />
        </FormField>
        <FormField label={t("store.supplierQuotationSettings.brandColor")}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("store.supplierQuotationSettings.brandColor")}
              value={form.brand_color || "#0f766e"}
              onChange={(event) => setScalar("brand_color", event.target.value)}
              className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent"
            />
            <Input
              value={form.brand_color}
              onChange={(event) => setScalar("brand_color", event.target.value)}
              placeholder="#0f766e"
            />
          </div>
        </FormField>

        <FormField
          label={t("store.supplierQuotationSettings.defaultPrintFormat")}
        >
          <FormSelect
            value={form.default_print_format}
            onChange={(value) => setScalar("default_print_format", value)}
            options={materialRequestPrintFormats}
          />
        </FormField>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(form.attach_print_format)}
              onCheckedChange={(checked) =>
                setScalar("attach_print_format", checked ? 1 : 0)
              }
            />
            {t("store.supplierQuotationSettings.attachPrintFormat")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(form.enable_response_hooks)}
              onCheckedChange={(checked) =>
                setScalar("enable_response_hooks", checked ? 1 : 0)
              }
            />
            {t("store.supplierQuotationSettings.enableResponseHooks")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("store.supplierQuotationSettings.responseHooksHint")}
          </p>
        </div>
      </FormSection>

      <FormSection
        title={t("store.supplierQuotationSettings.fieldsTitle")}
        description={t("store.supplierQuotationSettings.fieldsHint", {
          count: editableCount,
        })}
        icon={ListChecks}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={rescan}
            disabled={saving || loading}
          >
            <RefreshCw className="size-3.5" />
            {t("store.supplierQuotationSettings.rescan")}
          </Button>
        }
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {SCOPES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setScope(item.key)}
                className={
                  scope === item.key
                    ? "rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                }
              >
                {t(item.label)}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("store.supplierQuotationSettings.searchFields")}
              className="ps-8"
            />
          </div>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          {t("store.supplierQuotationSettings.fieldsLegend")}
        </p>

        <div className="flex flex-col gap-2">
          {visibleFields.map((row) => {
            const index = fields.indexOf(row);
            return (
              <div
                key={`${row.scope}:${row.fieldname}`}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.label}</span>
                      {row.custom ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {t("store.supplierQuotationSettings.custom")}
                        </span>
                      ) : null}
                      {!row.editable_eligible ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {t("store.supplierQuotationSettings.contextOnly")}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.fieldname} · {row.fieldtype}
                      {row.options ? ` · ${row.options}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {t("store.supplierQuotationSettings.showToSupplier")}
                    </span>
                    <Switch
                      checked={Boolean(row.enabled)}
                      onCheckedChange={(checked) =>
                        updateField(index, { enabled: checked ? 1 : 0 })
                      }
                    />
                  </div>
                </div>

                {row.enabled ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 border-t border-border/60 pt-2 sm:grid-cols-4">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={Boolean(row.supplier_editable)}
                        disabled={!row.editable_eligible}
                        onCheckedChange={(checked) =>
                          updateField(
                            index,
                            checked
                              ? { supplier_editable: 1 }
                              : { supplier_editable: 0, mandatory: 0 },
                          )
                        }
                      />
                      {t("store.supplierQuotationSettings.supplierEditable")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={Boolean(row.mandatory)}
                        disabled={!row.supplier_editable}
                        onCheckedChange={(checked) =>
                          updateField(index, { mandatory: checked ? 1 : 0 })
                        }
                      />
                      {t("store.supplierQuotationSettings.mandatory")}
                    </label>
                    <FormField
                      label={t("store.supplierQuotationSettings.order")}
                      className="gap-1"
                    >
                      <Input
                        type="number"
                        className="h-7"
                        value={row.display_order}
                        onChange={(event) =>
                          updateField(index, {
                            display_order: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField
                      label={t("store.supplierQuotationSettings.helpText")}
                      className="gap-1"
                    >
                      <Input
                        className="h-7"
                        value={row.help_text}
                        onChange={(event) =>
                          updateField(index, { help_text: event.target.value })
                        }
                        placeholder={t(
                          "store.supplierQuotationSettings.helpTextPlaceholder",
                        )}
                      />
                    </FormField>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!loading && visibleFields.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {t("store.supplierQuotationSettings.noFields")}
            </p>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title={t("store.supplierQuotationSettings.emailsTitle")}
        description={t("store.supplierQuotationSettings.emailsHint")}
        icon={Mail}
        contentClassName="flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField
            label={t("store.supplierQuotationSettings.invitationSubject")}
          >
            <Input
              maxLength={140}
              value={form.invitation_subject}
              onChange={(event) =>
                setScalar("invitation_subject", event.target.value)
              }
            />
          </FormField>
          <FormField
            label={t("store.supplierQuotationSettings.responseSubject")}
          >
            <Input
              maxLength={140}
              value={form.response_subject}
              onChange={(event) =>
                setScalar("response_subject", event.target.value)
              }
            />
          </FormField>
          <FormField
            label={t("store.supplierQuotationSettings.acknowledgementSubject")}
          >
            <Input
              maxLength={140}
              value={form.supplier_acknowledgement_subject}
              onChange={(event) =>
                setScalar("supplier_acknowledgement_subject", event.target.value)
              }
            />
          </FormField>
          <FormField
            label={t("store.supplierQuotationSettings.quotationEmailSubject")}
          >
            <Input
              maxLength={140}
              value={form.supplier_quotation_email_subject}
              onChange={(event) =>
                setScalar("supplier_quotation_email_subject", event.target.value)
              }
            />
          </FormField>
        </div>
        <FormField
          label={t("store.supplierQuotationSettings.invitationMessage")}
          hint={t("store.supplierQuotationSettings.placeholdersHint")}
        >
          <Textarea
            rows={5}
            value={form.invitation_message}
            onChange={(event) =>
              setScalar("invitation_message", event.target.value)
            }
          />
        </FormField>
        <FormField
          label={t("store.supplierQuotationSettings.responseMessage")}
          hint={t("store.supplierQuotationSettings.placeholdersHint")}
        >
          <Textarea
            rows={4}
            value={form.response_message}
            onChange={(event) =>
              setScalar("response_message", event.target.value)
            }
          />
        </FormField>
        <FormField
          label={t("store.supplierQuotationSettings.acknowledgementMessage")}
          hint={t("store.supplierQuotationSettings.acknowledgementMessageHint")}
        >
          <Textarea
            rows={4}
            value={form.supplier_acknowledgement_message}
            onChange={(event) =>
              setScalar("supplier_acknowledgement_message", event.target.value)
            }
          />
        </FormField>
        <FormField
          label={t("store.supplierQuotationSettings.quotationEmailMessage")}
          hint={t("store.supplierQuotationSettings.quotationEmailMessageHint")}
        >
          <Textarea
            rows={4}
            value={form.supplier_quotation_email_message}
            onChange={(event) =>
              setScalar("supplier_quotation_email_message", event.target.value)
            }
          />
        </FormField>
        <FormField
          label={t("store.supplierQuotationSettings.acknowledgementPrintFormat")}
          hint={t("store.supplierQuotationSettings.acknowledgementPrintFormatHint")}
        >
          <FormSelect
            value={form.supplier_acknowledgement_print_format}
            onChange={(value) =>
              setScalar("supplier_acknowledgement_print_format", value)
            }
            options={acknowledgementPrintFormats}
          />
        </FormField>
      </FormSection>

      <FormSection
        title={t("store.supplierQuotationSettings.securityTitle")}
        description={t("store.supplierQuotationSettings.securityHint")}
        icon={ShieldCheck}
        contentClassName="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label={t("store.supplierQuotationSettings.otpExpiry")}>
            <Input
              type="number"
              min="1"
              value={form.otp_expiry_minutes}
              onChange={(event) =>
                setScalar("otp_expiry_minutes", event.target.value)
              }
            />
          </FormField>
          <FormField label={t("store.supplierQuotationSettings.otpAttempts")}>
            <Input
              type="number"
              min="1"
              value={form.otp_max_attempts}
              onChange={(event) =>
                setScalar("otp_max_attempts", event.target.value)
              }
            />
          </FormField>
          <FormField label={t("store.supplierQuotationSettings.otpThrottle")}>
            <Input
              type="number"
              min="0"
              value={form.otp_resend_throttle_minutes}
              onChange={(event) =>
                setScalar("otp_resend_throttle_minutes", event.target.value)
              }
            />
          </FormField>
          <FormField
            label={t("store.supplierQuotationSettings.invitationExpiry")}
          >
            <Input
              type="number"
              min="1"
              value={form.invitation_expiry_days}
              onChange={(event) =>
                setScalar("invitation_expiry_days", event.target.value)
              }
            />
          </FormField>
          <FormField
            label={t("store.supplierQuotationSettings.sessionMinutes")}
          >
            <Input
              type="number"
              min="1"
              value={form.response_session_minutes}
              onChange={(event) =>
                setScalar("response_session_minutes", event.target.value)
              }
            />
          </FormField>
          <FormField label={t("store.supplierQuotationSettings.maxSuppliers")}>
            <Input
              type="number"
              min="1"
              value={form.max_suppliers_per_request}
              onChange={(event) =>
                setScalar("max_suppliers_per_request", event.target.value)
              }
            />
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {t("store.supplierQuotationSettings.recipientsTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("store.supplierQuotationSettings.recipientsHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRecipient}
            >
              {t("store.supplierQuotationSettings.addRecipient")}
            </Button>
          </div>

          {recipients.length ? (
            <div className="flex flex-col gap-2">
              {recipients.map((recipient, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center"
                >
                  <Input
                    type="email"
                    value={recipient.email}
                    onChange={(event) =>
                      updateRecipient(index, { email: event.target.value })
                    }
                    placeholder={t(
                      "store.supplierQuotationSettings.recipientPlaceholder",
                    )}
                  />
                  <label className="flex shrink-0 items-center gap-2 text-xs">
                    <Checkbox
                      checked={Boolean(recipient.enabled)}
                      onCheckedChange={(checked) =>
                        updateRecipient(index, { enabled: checked ? 1 : 0 })
                      }
                    />
                    {t("store.supplierQuotationSettings.recipientEnabled")}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRecipient(index)}
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              {t("store.supplierQuotationSettings.noRecipients")}
            </p>
          )}
        </div>
      </FormSection>

      <div className="flex justify-end pb-6">
        <Button
          type="button"
          onClick={() => saveRef.current()}
          disabled={loading || saving || !dirty}
        >
          <Save className="size-4" />
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
