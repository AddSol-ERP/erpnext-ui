import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Table2, Trash2 } from "lucide-react";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import FormSelect from "../../../../components/FormSelect";
import { focusFirstError } from "../../../../lib/formValidation";
import LinkField from "../../../../components/LinkField";
import { useHeader } from "../../../../context/HeaderContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPE_OPTIONS = [
  { value: "Purchase", labelKey: "store.types.purchase" },
  { value: "Transfer", labelKey: "store.types.transfer" },
  { value: "Material Issue", labelKey: "store.types.materialIssue" },
  { value: "Material Receipt", labelKey: "store.types.materialReceipt" },
  { value: "Customer Provided", labelKey: "store.types.customerProvided" },
];

export default function MaterialRequestForm() {
  const { name, type } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    material_request_type: "",
    company: "",
    customer: "",
    schedule_date: "",
    items: [],
    docstatus: 0,
  });

  const typeLabel = doc.material_request_type
    ? t(
        TYPE_OPTIONS.find((o) => o.value === doc.material_request_type)
          ?.labelKey || "store.tiles.materialRequest.title",
      )
    : t("store.tiles.materialRequest.title");

  /* ================= HELPERS ================= */
  const autoCompany = async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Company",
        fields: JSON.stringify(["name"]),
        limit_page_length: 1,
      });

      if (res.message?.length) {
        setDoc((p) => ({ ...p, company: res.message[0].name }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Material Request/${name}`);
      const d = res.data;

      setDoc({
        material_request_type: d.material_request_type,
        company: d.company,
        customer: d.customer || "",
        schedule_date: d.schedule_date,
        items: d.items || [],
        docstatus: d.docstatus,
      });
    } catch {
      setError(t("common.failedToLoad", { name: t("store.mr.title") }));
    } finally {
      setLoading(false);
    }
  };

  /* ================= ITEMS ================= */
  const addRow = () => {
    setDoc((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          item_code: "",
          qty: "",
          uom: "",
          stock_uom: "",
          conversion_factor: 1,
          schedule_date: p.schedule_date,
          from_warehouse: "",
          warehouse: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) =>
        idx === i ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const removeRow = (i) => {
    setDoc({
      ...doc,
      items: doc.items.filter((_, idx) => idx !== i),
    });
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    const errs = {};

    if (!doc.material_request_type) {
      errs.material_request_type = t("store.validation.typeRequired");
    }
    if (!doc.company) {
      errs.company = t("store.validation.companyRequired");
    }
    if (
      doc.material_request_type === "Customer Provided" &&
      !doc.customer
    ) {
      errs.customer = t("store.validation.customerRequired");
    }

    if (!doc.items.length) {
      errs.items = t("store.validation.addAtLeastOneItem");
    } else {
      for (let i = 0; i < doc.items.length; i++) {
        const row = doc.items[i];
        if (!row.item_code || !row.qty) {
          errs.items = t("store.validation.fillAllRows");
          break;
        }
        if (!row.uom) {
          errs.items = t("store.validation.uomRequired");
          break;
        }
        if (!row.conversion_factor || row.conversion_factor <= 0) {
          errs.items = t("store.validation.invalidConversion");
          break;
        }
        if (parseFloat(row.qty) <= 0) {
          errs.items = t("store.validation.qtyGtZero");
          break;
        }
        if (doc.material_request_type === "Transfer") {
          if (!row.from_warehouse || !row.warehouse) {
            errs.items = t("store.validation.fromToWarehouseRequired");
            break;
          }
          if (row.from_warehouse === row.warehouse) {
            errs.items = t("store.validation.sameWarehouse");
            break;
          }
        } else if (!row.warehouse) {
          errs.items = t("store.validation.warehouseRequired");
          break;
        }
      }
    }

    const list = Object.values(errs);
    setFieldErrors(errs);
    return {
      fieldErrors: errs,
      summary: list.length > 1 ? t("common.fixErrors") : list[0] || "",
    };
  };

  /* ================= SAVE ================= */
  const handleSave = async () => {
    const result = validate();
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    try {
      setLoading(true);
      setError("");

      let res;

      if (isEdit) {
        await post(`resource/Material Request/${name}`, doc);
        res = { data: { name } };
      } else {
        res = await post("resource/Material Request", doc);
      }

      navigate(
        `/store/material-request/${doc.material_request_type}/view/${res.data.name}`,
      );
    } catch {
      setError(t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= SUBMIT ================= */
  const handleSubmit = async () => {
    try {
      setLoading(true);

      await post("method/frappe.client.submit", {
        doctype: "Material Request",
        name: name,
      });

      loadDoc();
    } catch {
      setError(t("common.submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = async (i, itemCode) => {
    updateRow(i, "item_code", itemCode);

    try {
      const res = await get(`resource/Item/${itemCode}`);
      const item = res.data;

      setDoc((p) => ({
        ...p,
        items: p.items.map((row, idx) =>
          idx === i
            ? {
                ...row,
                uom: item.stock_uom,
                stock_uom: item.stock_uom,
                conversion_factor: 1,
              }
            : row,
        ),
      }));
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit ? name : t("store.mr.newTitle"),
      subtitle: isEdit
        ? doc.docstatus === 1
          ? t("store.mr.subtitleSubmitted", { type: typeLabel })
          : t("store.mr.subtitleDraft", { type: typeLabel })
        : t("store.mr.createSubtitle", { type: typeLabel }),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        {
          label: t("store.mr.title"),
          path: "/store/material-request",
        },
        doc.material_request_type && {
          label: typeLabel,
          path: `/store/material-request/type/${doc.material_request_type}`,
        },
        { label: isEdit ? name : t("common.new") },
      ].filter(Boolean),

      actions: [
        !doc.docstatus && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        },

        isEdit &&
          doc.docstatus === 0 && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSubmit,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, name, doc.docstatus, doc.material_request_type, loading]);

  /* ================= DEFAULT ================= */
  useEffect(() => {
    if (!isEdit) {
      const requestType = type || params.get("type");

      // Mirror route/default values into the form on first mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDoc((p) => ({
        ...p,
        material_request_type: requestType || "",
        schedule_date: new Date().toISOString().split("T")[0],
      }));

      autoCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= TYPE CHANGE CLEANUP ================= */
  useEffect(() => {
    // Field cleanup mirrors doc.material_request_type changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoc((prev) => ({
      ...prev,
      customer:
        prev.material_request_type === "Customer Provided" ? prev.customer : "",
      items: prev.items.map((row) => ({
        ...row,
        from_warehouse:
          prev.material_request_type === "Transfer" ? row.from_warehouse : "",
      })),
    }));
  }, [doc.material_request_type]);

  /* ================= LOAD ================= */
  useEffect(() => {
    // loadDoc only setStates after the awaited API response / loading flag.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isEdit) loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("store.form.basics")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField
          label={t("store.form.type")}
          required
          name="material_request_type"
          error={fieldErrors.material_request_type}
        >
          <FormSelect
            value={doc.material_request_type}
            disabled={isEdit}
            placeholder={t("store.mr.form.select")}
            onChange={(v) =>
              setDoc({ ...doc, material_request_type: v })
            }
            options={TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
          />
        </FormField>

        <FormField
          label={t("store.form.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          <LinkField
            doctype="Company"
            value={doc.company}
            onChange={(v) => setDoc({ ...doc, company: v })}
          />
        </FormField>

        {doc.material_request_type === "Customer Provided" && (
          <FormField
            label={t("store.form.customer")}
            required
            name="customer"
            error={fieldErrors.customer}
          >
            <LinkField
              doctype="Customer"
              value={doc.customer}
              onChange={(v) => setDoc({ ...doc, customer: v })}
            />
          </FormField>
        )}

        <FormField
          label={t("store.form.scheduleDate")}
          name="schedule_date"
        >
          <Input
            type="date"
            value={doc.schedule_date}
            onChange={(e) =>
              setDoc({ ...doc, schedule_date: e.target.value })
            }
          />
        </FormField>
      </FormSection>

      {/* ITEMS */}
      <FormSection
        title={t("store.mr.form.items")}
        icon={Table2}
        action={
          !doc.docstatus ? (
            <Button size="sm" onClick={addRow}>
              <Plus />
              {t("common.addRow")}
            </Button>
          ) : null
        }
        contentClassName="flex flex-col gap-3"
      >
        <FormField
          name="items"
          error={fieldErrors.items}
          className={fieldErrors.items ? "" : "sr-only"}
        >
          <span className="sr-only">{t("store.mr.form.items")}</span>
        </FormField>

        {doc.items.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-12 md:items-end"
          >
            {/* ITEM */}
            <div className="col-span-2 md:col-span-3">
              <FormField label={t("store.form.item")} required>
                <LinkField
                  doctype="Item"
                  value={row.item_code}
                  onChange={(v) => handleItemChange(i, v)}
                />
              </FormField>
            </div>

            {/* QTY */}
            <div className="md:col-span-1">
              <FormField label={t("store.form.qty")} required>
                <Input
                  type="number"
                  value={row.qty}
                  onChange={(e) => updateRow(i, "qty", e.target.value)}
                />
              </FormField>
            </div>

            {/* UOM */}
            <div className="md:col-span-2">
              <FormField label={t("store.form.uom")} required>
                <LinkField
                  doctype="UOM"
                  value={row.uom}
                  onChange={(v) => updateRow(i, "uom", v)}
                />
              </FormField>
            </div>

            {/* STOCK UOM (READ ONLY) */}
            <div className="md:col-span-2">
              <FormField label={t("store.form.stockUom")}>
                <Input value={row.stock_uom || ""} disabled />
              </FormField>
            </div>

            {/* CONVERSION */}
            <div className="md:col-span-1">
              <FormField label={t("store.form.conv")}>
                <Input
                  type="number"
                  value={row.conversion_factor || 1}
                  onChange={(e) =>
                    updateRow(i, "conversion_factor", e.target.value)
                  }
                />
              </FormField>
            </div>

            {/* SOURCE (TRANSFER ONLY) */}
            {doc.material_request_type === "Transfer" && (
              <div className="md:col-span-3">
                <FormField label={t("store.form.source")} required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.from_warehouse}
                    onChange={(v) => updateRow(i, "from_warehouse", v)}
                  />
                </FormField>
              </div>
            )}

            {/* TARGET */}
            <div className="md:col-span-3">
              <FormField label={t("store.form.warehouse")} required>
                <LinkField
                  doctype="Warehouse"
                  value={row.warehouse}
                  onChange={(v) => updateRow(i, "warehouse", v)}
                />
              </FormField>
            </div>

            {/* DATE */}
            <div className="md:col-span-2">
              <FormField label={t("store.form.schedule")}>
                <Input
                  type="date"
                  value={row.schedule_date}
                  onChange={(e) =>
                    updateRow(i, "schedule_date", e.target.value)
                  }
                />
              </FormField>
            </div>

            {/* DELETE */}
            {!doc.docstatus && (
              <div className="col-span-2 flex items-end md:col-span-1">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => removeRow(i)}
                  aria-label={t("common.delete")}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ))}
      </FormSection>
    </div>
  );
}
