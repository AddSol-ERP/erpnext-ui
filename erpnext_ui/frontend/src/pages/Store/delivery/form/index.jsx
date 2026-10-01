import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Table2, Trash2, Truck } from "lucide-react";
import { useHeader } from "../../../../context/HeaderContext";
import { get, post } from "../../../../services/api";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import { focusFirstError } from "../../../../lib/formValidation";
import LinkField from "../../../../components/LinkField";
import DeliveryNotePicker from "./DeliveryNotePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DeliveryNoteForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const [showSource, setShowSource] = useState(false);
  const isEdit = !!name;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    customer: "",
    company: "",
    posting_date: "",
    set_warehouse: "",
    items: [],
    // dispatch
    driver: "",
    vehicle_no: "",
    transporter: "",
    lr_number: "",
    dispatch_date: "",
    docstatus: 0,
  });

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
    } catch {
      // company stays empty — validated on save
    }
  };

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Delivery Note/${name}`);
      const d = res.data;

      setDoc({
        customer: d.customer,
        company: d.company,
        posting_date: d.posting_date,
        set_warehouse: d.set_warehouse,
        items: d.items || [],
        driver: d.driver || "",
        vehicle_no: d.vehicle_no || "",
        transporter: d.transporter || "",
        lr_number: d.lr_number || "",
        dispatch_date: d.dispatch_date || "",
        docstatus: d.docstatus,
      });
    } catch {
      setError(t("common.failedToLoad", { name: t("store.dn.title") }));
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
          warehouse: p.set_warehouse || "",
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

  /* ================= ITEM AUTO-POPULATE ================= */
  const handleItemChange = async (i, itemCode) => {
    updateRow(i, "item_code", itemCode);

    // Auto-fill UOM from Item master
    try {
      const res = await get(`resource/Item/${encodeURIComponent(itemCode)}`);
      const item = res.data;

      if (item) {
        const uom = item.stock_uom || "";

        setDoc((p) => ({
          ...p,
          items: p.items.map((row, idx) =>
            idx === i ? { ...row, uom } : row,
          ),
        }));
      }
    } catch (e) {
      console.warn("Failed to fetch item details:", e);
    }
  };

  /* ================= VALIDATION ================= */
  const validate = () => {
    const errs = {};

    if (!doc.customer) {
      errs.customer = t("store.validation.customerRequired");
    }
    if (!doc.company) {
      errs.company = t("store.validation.companyRequired");
    }

    if (!doc.items.length) {
      errs.items = t("store.validation.addItems");
    } else {
      for (const row of doc.items) {
        if (!row.item_code || !row.qty) {
          errs.items = t("store.validation.fillItemRows");
          break;
        }
        if (parseFloat(row.qty) <= 0) {
          errs.items = t("store.validation.qtyGtZero");
          break;
        }
        if (!row.warehouse) {
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
        await post(`resource/Delivery Note/${name}`, doc);
        res = { data: { name } };
      } else {
        res = await post("resource/Delivery Note", doc);
      }

      navigate(`/store/delivery/${res.data.name}`);
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
        doctype: "Delivery Note",
        name,
      });

      loadDoc();
    } catch {
      setError(t("common.submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("store.dn.editTitle", { name })
        : t("store.dn.newTitle"),
      subtitle: t("store.dn.formSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.dn.title"), path: "/store/delivery" },
        { label: isEdit ? name : t("common.new") },
      ],

      actions: [
        {
          label: t("common.back"),
          variant: "btn-outline-primary",
          onClick: () => navigate(-1),
        },
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
  }, [loading, doc]);

  /* ================= INIT ================= */
  useEffect(() => {
    // loadDoc/default setDoc only touch state after mount setup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isEdit) loadDoc();
    else {
      setDoc((p) => ({
        ...p,
        posting_date: new Date().toISOString().split("T")[0],
      }));
      autoCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 pt-4">
      {showSource && (
        <DeliveryNotePicker
          show={showSource}
          onClose={() => setShowSource(false)}
          onLoad={(data) => {
            setDoc((p) => ({
              ...p,
              customer: data.customer || p.customer,
              items: data.items,
            }));
          }}
        />
      )}

      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("store.form.basics")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-4"
      >
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

        <FormField
          label={t("store.form.postingDate")}
          name="posting_date"
        >
          <Input
            type="date"
            value={doc.posting_date}
            onChange={(e) =>
              setDoc({ ...doc, posting_date: e.target.value })
            }
          />
        </FormField>

        <FormField
          label={t("store.form.defaultWarehouse")}
          name="set_warehouse"
        >
          <LinkField
            doctype="Warehouse"
            value={doc.set_warehouse}
            onChange={(v) => setDoc({ ...doc, set_warehouse: v })}
          />
        </FormField>
      </FormSection>

      {/* ITEMS */}
      <FormSection
        title={t("store.form.items")}
        icon={Table2}
        action={
          !doc.docstatus ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSource(true)}
              >
                {t("store.form.getItems")}
              </Button>

              <Button size="sm" onClick={addRow}>
                <Plus />
                {t("common.addRow")}
              </Button>
            </div>
          ) : null
        }
        contentClassName="flex flex-col gap-3"
      >
        <FormField
          name="items"
          error={fieldErrors.items}
          className={fieldErrors.items ? "" : "sr-only"}
        >
          <span className="sr-only">{t("store.form.items")}</span>
        </FormField>

        {doc.items.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-12 md:items-end"
          >
            <div className="col-span-2 md:col-span-3">
              <FormField label={t("store.form.item")} required>
                <LinkField
                  doctype="Item"
                  value={row.item_code}
                  onChange={(v) => handleItemChange(i, v)}
                />
              </FormField>
            </div>

            <div className="md:col-span-2">
              <FormField label={t("store.form.qty")} required>
                <Input
                  type="number"
                  value={row.qty}
                  onChange={(e) => updateRow(i, "qty", e.target.value)}
                />
              </FormField>
            </div>

            <div className="md:col-span-2">
              <FormField label={t("store.form.uom")}>
                <Input
                  value={row.uom}
                  onChange={(e) => updateRow(i, "uom", e.target.value)}
                />
              </FormField>
            </div>

            <div className="col-span-2 md:col-span-3">
              <FormField label={t("store.form.warehouse")} required>
                <LinkField
                  doctype="Warehouse"
                  value={row.warehouse}
                  onChange={(v) => updateRow(i, "warehouse", v)}
                />
              </FormField>
            </div>

            {!doc.docstatus && (
              <div className="col-span-2 flex items-end md:col-span-2">
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

      {/* DISPATCH */}
      <FormSection
        title={t("store.form.dispatch")}
        icon={Truck}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        <FormField label={t("store.form.driver")} name="driver">
          <Input
            value={doc.driver}
            onChange={(e) => setDoc({ ...doc, driver: e.target.value })}
          />
        </FormField>

        <FormField label={t("store.form.vehicleNo")} name="vehicle_no">
          <Input
            value={doc.vehicle_no}
            onChange={(e) => setDoc({ ...doc, vehicle_no: e.target.value })}
          />
        </FormField>

        <FormField
          label={t("store.form.transporter")}
          name="transporter"
        >
          <Input
            value={doc.transporter}
            onChange={(e) =>
              setDoc({ ...doc, transporter: e.target.value })
            }
          />
        </FormField>

        <FormField label={t("store.form.lrNumber")} name="lr_number">
          <Input
            value={doc.lr_number}
            onChange={(e) => setDoc({ ...doc, lr_number: e.target.value })}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
