import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Table2, Trash2, Info } from "lucide-react";
import { get } from "../../../../services/api";
import { saveDocument, submitDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import FormSelect from "../../../../components/FormSelect";
import { focusFirstError } from "../../../../lib/formValidation";
import LinkField from "../../../../components/LinkField";
import { useHeader } from "../../../../context/HeaderContext";
import { requestPurpose } from "../../../../config/storePurposes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateISO } from "../../../../utils/localDateTime";

/**
 * Raise an indent (and the other four request purposes).
 *
 * Two things changed here that matter more than they look:
 *
 * 1. **There is no Purpose dropdown.** The type is derived from the `:purpose`
 *    route segment through config/storePurposes.js. The previous form offered a
 *    Select containing "Transfer" and "Material Receipt", neither of which is a
 *    valid `material_request_type` -- every such save died with a bare HTTP 417.
 *    Removing the control removes the possibility rather than validating it.
 *
 * 2. **Every item row carries its own Project.** Setting one switches that row's
 *    Item field from free search to the project's bill of materials, showing
 *    what is still needed. Clearing it goes back to free search. That is the
 *    split between "project specific" and "other than project" the shop floor
 *    actually works in.
 */
export default function MaterialRequestForm() {
  const { name, purpose } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;
  const cfg = purpose ? requestPurpose(purpose) : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    // On edit the server value wins; on create the purpose supplies it.
    material_request_type: cfg?.materialRequestType || "",
    company: "",
    customer: "",
    schedule_date: "",
    items: [],
    docstatus: 0,
  });

  /**
   * project -> { loading, hasBom, items, error }
   *
   * Cached per project because several rows usually share one project, and
   * re-exploding a BOM on every keystroke in another row's project field would
   * be wasteful.
   */
  const [projectItems, setProjectItems] = useState({});

  // The Save button is registered into the page toolbar by an effect that
  // deliberately does not depend on `doc` (re-running it per keystroke would
  // thrash the toolbar), so the registered handler closes over the document as
  // of an early render -- validation and the saved payload then used stale
  // data. Handlers read through this ref.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const purposeTitle = cfg ? t(`store.purposes.${cfg.i18nKey}.title`) : t("store.mr.title");
  const isTransfer = doc.material_request_type === "Material Transfer";
  const isCustomerProvided = doc.material_request_type === "Customer Provided";

  /* ================= HELPERS ================= */

  const autoCompany = useCallback(async () => {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Company",
        fields: JSON.stringify(["name"]),
        limit_page_length: 1,
      });

      if (res.message?.length) {
        setDoc((p) => ({ ...p, company: p.company || res.message[0].name }));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadDoc = useCallback(async () => {
    try {
      setLoading(true);

      const res = await get(`resource/Material Request/${name}`);
      const d = res.data;

      setDoc({
        material_request_type: d.material_request_type,
        company: d.company,
        customer: d.customer || "",
        schedule_date: d.schedule_date || "",
        items: (d.items || []).map((r) => ({
          ...r,
          // Keep these as numbers/strings the inputs can bind to; the server
          // returns floats for qty and stock_qty which render fine either way.
          qty: r.qty ?? "",
          project: r.project || "",
          uom: r.uom || "",
          stock_uom: r.stock_uom || "",
          conversion_factor: r.conversion_factor ?? 1,
          schedule_date: r.schedule_date || "",
          from_warehouse: r.from_warehouse || "",
          warehouse: r.warehouse || "",
        })),
        docstatus: d.docstatus,
      });
    } catch {
      setError(t("common.failedToLoad", { name: t("store.mr.title") }));
    } finally {
      setLoading(false);
    }
  }, [name, t]);

  /**
   * Explode the project's BOM so its rows can offer only those items.
   *
   * Failure is recorded but never blocks typing: a person must still be able to
   * free-text items if a BOM is missing or unreadable.
   */
  const loadProjectItems = useCallback(async (project) => {
    if (!project) return;
    setProjectItems((p) => ({
      ...p,
      [project]: { ...(p[project] || {}), loading: true, error: "" },
    }));

    try {
      const message = await get("method/erpnext_ui.api.get_project_items", {
        project,
      });
      setProjectItems((p) => ({
        ...p,
        [project]: { loading: false, hasBom: !!message.has_bom, items: message.items || [] },
      }));
    } catch (e) {
      setProjectItems((p) => ({
        ...p,
        [project]: { loading: false, hasBom: false, items: [], error: e.message },
      }));
    }
  }, []);

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
          project: "",
          from_warehouse: "",
          warehouse: "",
        },
      ],
    }));
  };

  const updateRow = (i, field, value) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    }));
  };

  const removeRow = (i) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  };

  /**
   * Setting a project clears the item on that row.
   *
   * Otherwise the row would keep an item chosen under a different project's
   * BOM, and the UI would claim it is a project item when it is not.
   */
  const handleProjectChange = (i, project) => {
    updateRow(i, "project", project || "");
    updateRow(i, "item_code", "");
    updateRow(i, "qty", "");
    updateRow(i, "uom", "");
    if (project) loadProjectItems(project);
  };

  /** Adopt a BOM item: quantity defaults to what is still outstanding. */
  const applyBomItem = (i, itemCode) => {
    const cache = projectItems[doc.items[i]?.project];
    const match = cache?.items?.find((it) => it.item_code === itemCode);
    if (!match) return;

    const outstanding = Number(match.outstanding_qty ?? 0);
    setDoc((p) => ({
      ...p,
      items: p.items.map((row, idx) =>
        idx === i
          ? {
              ...row,
              item_code: match.item_code,
              item_name: match.item_name,
              uom: match.uom || match.stock_uom,
              stock_uom: match.stock_uom,
              conversion_factor: match.conversion_factor || 1,
              // Pre-fill with the gap, not the full BOM quantity: asking for
              // material that was already requested is how duplicate indents
              // happen. Falls back to the BOM quantity when nothing is pending.
              qty:
                row.qty !== "" && row.qty != null
                  ? row.qty
                  : String(outstanding > 0 ? outstanding : match.required_qty ?? ""),
              warehouse: row.warehouse || match.source_warehouse || "",
            }
          : row,
      ),
    }));
  };

  /** Free-search item: fill UOM from the Item master. */
  const handleItemChange = async (i, itemCode) => {
    updateRow(i, "item_code", itemCode || "");
    if (!itemCode) return;

    try {
      // encodeURIComponent matters: an item code may legitimately contain "/"
      // or "#", which would otherwise split the REST path.
      const res = await get(`resource/Item/${encodeURIComponent(itemCode)}`);
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
                // UOM Conversion Factor has no server-side derivation here, so
                // an explicit change away from stock UOM must at least reset it
                // to something valid rather than leave a stale 0.
                qty: row.qty,
              }
            : row,
        ),
      }));
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= VALIDATION ================= */

  const validate = (d = docRef.current) => {
    const errs = {};

    if (!d.material_request_type) {
      errs.material_request_type = t("store.validation.typeRequired");
    }
    if (!d.company) {
      errs.company = t("store.validation.companyRequired");
    }
    if (d.material_request_type === "Customer Provided" && !d.customer) {
      errs.customer = t("store.validation.customerRequired");
    }

    if (!d.items.length) {
      errs.items = t("store.validation.addAtLeastOneItem");
    } else {
      for (let i = 0; i < d.items.length; i++) {
        const row = d.items[i];
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
        // "Transfer" was never a valid material_request_type; the correct
        // value is "Material Transfer". Comparing against the wrong string
        // meant the transfer warehouse rules never ran.
        if (d.material_request_type === "Material Transfer") {
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
    const current = docRef.current;

    const result = validate(current);
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await saveDocument({
        doctype: "Material Request",
        name: isEdit ? name : undefined,
        doc: current,
      });

      // A registered, real route. The old code navigated to
      // /store/material-request/<type>/view/<name>, which nothing matched --
      // the user landed on a blank page after every successful save.
      navigate(`/store/material-request/${res.data.name}`);
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

      // `frappe.client.submit` takes the whole document, not {doctype, name}.
      await submitDocument({ doctype: "Material Request", name });
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
      title: isEdit ? name : t("store.mr.newTitle"),
      subtitle: t("store.mr.createSubtitle", { type: purposeTitle }),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        {
          // Points at the single all-requests list, not a per-purpose one.
          // Purpose cards open the form directly, so a per-purpose list would
          // have no way in — an unreachable route is worse than no route.
          label: t("store.mr.allTitle"),
          path: "/store/material-request",
        },
        { label: purposeTitle },
        { label: isEdit ? name : t("common.new") },
      ],

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
  }, [isEdit, name, purpose, purposeTitle, doc.docstatus, loading]);

  /* ================= DEFAULT ================= */

  useEffect(() => {
    if (!isEdit) {
      // Mirror route/default values into the form on first mount.
      setDoc((p) => ({
        ...p,
        material_request_type: cfg?.materialRequestType || "",
        schedule_date: p.schedule_date || localDateISO(),
      }));

      autoCompany();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= LOAD ================= */
  useEffect(() => {
    if (isEdit) loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Warm the BOM cache for every project already on a loaded document, so an
  // existing indent opens showing its quantities rather than empty rows.
  useEffect(() => {
    if (!isEdit || loading) return;
    const projects = new Set(
      doc.items.map((r) => r.project).filter(Boolean),
    );
    projects.forEach((p) => {
      if (!projectItems[p]) loadProjectItems(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, loading, doc.items]);

  const bomOptionsFor = useMemo(
    () => (project) => {
      const cache = projectItems[project];
      if (!cache || cache.loading || !cache.items?.length) return [];
      return cache.items.map((it) => {
        const outstanding = Number(it.outstanding_qty ?? 0);
        const suffix =
          outstanding > 0
            ? ` — ${t("store.projectItems.outstanding")}: ${outstanding}`
            : ` — ${t("store.projectItems.required")}: ${it.required_qty}`;
        return { value: it.item_code, label: `${it.item_code} · ${it.item_name}${suffix}` };
      });
    },
    [projectItems, t],
  );

  /* ================= UI ================= */

  if (!cfg && !isEdit) {
    return (
      <div className="mx-auto w-full max-w-[1100px] pt-4">
        <FormErrorSummary
          summary={t("store.mr.unknownPurpose")}
          fieldErrors={{}}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("store.form.basics")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField label={t("store.form.purpose")} required name="material_request_type">
          <Input value={purposeTitle} disabled />
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

        {isCustomerProvided && (
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

        <FormField label={t("store.form.requiredBy")} name="schedule_date">
          <Input
            type="date"
            value={doc.schedule_date}
            onChange={(e) => setDoc({ ...doc, schedule_date: e.target.value })}
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
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("store.projectItems.hint")}
        </p>

        <FormField
          name="items"
          error={fieldErrors.items}
          className={fieldErrors.items ? "" : "sr-only"}
        >
          <span className="sr-only">{t("store.mr.form.items")}</span>
        </FormField>

        {doc.items.map((row, i) => {
          const cache = row.project ? projectItems[row.project] : null;
          const bomOptions = bomOptionsFor(row.project);
          const useBomPicker = Boolean(row.project && bomOptions.length);

          return (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-12 md:items-end"
            >
              {/* PROJECT — the switch between project-scoped and free items */}
              <div className="col-span-2 md:col-span-2">
                <FormField label={t("store.labels.projectOptional")}>
                  <LinkField
                    doctype="Project"
                    value={row.project}
                    onChange={(v) => handleProjectChange(i, v)}
                    placeholder={t("store.projectItems.chooseProject", {
                      defaultValue: "Choose a project",
                    })}
                  />
                </FormField>
              </div>

              {/* ITEM — BOM picker when a project with a BOM is set */}
              <div className="col-span-2 md:col-span-4">
                <FormField label={t("store.form.item")} required>
                  {useBomPicker ? (
                    <FormSelect
                      value={row.item_code}
                      placeholder={t("store.projectItems.chooseBom", {
                        defaultValue: "Choose an item",
                      })}
                      onChange={(v) => applyBomItem(i, v)}
                      options={bomOptions}
                    />
                  ) : (
                    <LinkField
                      doctype="Item"
                      value={row.item_code}
                      onChange={(v) => handleItemChange(i, v)}
                    />
                  )}
                </FormField>

                {row.project && cache?.loading && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("common.loading")}
                  </p>
                )}
                {row.project && !cache?.loading && cache && !cache.hasBom && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {t("store.projectItems.noBomShort")}
                  </p>
                )}
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
              <div className="md:col-span-1">
                <FormField label={t("store.form.uom")} required>
                  <Input value={row.uom || ""} disabled />
                </FormField>
              </div>

              {/* SOURCE — transfer only */}
              {isTransfer && (
                <div className="col-span-2 md:col-span-2">
                  <FormField label={t("store.labels.sourceWarehouse")} required>
                    <LinkField
                      doctype="Warehouse"
                      value={row.from_warehouse}
                      onChange={(v) => updateRow(i, "from_warehouse", v)}
                    />
                  </FormField>
                </div>
              )}

              {/* TARGET */}
              <div className="col-span-2 md:col-span-2">
                <FormField label={t("store.labels.targetWarehouse")} required>
                  <LinkField
                    doctype="Warehouse"
                    value={row.warehouse}
                    onChange={(v) => updateRow(i, "warehouse", v)}
                  />
                </FormField>
              </div>

              {/* REQUIRED BY */}
              <div className="md:col-span-1">
                <FormField label={t("store.form.requiredBy")}>
                  <Input
                    type="date"
                    value={row.schedule_date}
                    onChange={(e) => updateRow(i, "schedule_date", e.target.value)}
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
          );
        })}
      </FormSection>
    </div>
  );
}
