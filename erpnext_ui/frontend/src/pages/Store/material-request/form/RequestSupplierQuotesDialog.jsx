import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Plus, X } from "lucide-react";
import AppModal from "../../../../components/AppModal";
import { FormField } from "../../../../components/FormField";
import LinkField from "../../../../components/LinkField";
import FormSelect from "../../../../components/FormSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { get, post } from "../../../../services/api";
import { useToast } from "../../../../context/ToastContext";

export default function RequestSupplierQuotesDialog({ show, onClose, materialRequestName }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [supplierCandidate, setSupplierCandidate] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [printFormats, setPrintFormats] = useState([{ value: "Standard", label: "Standard" }]);
  const [printFormat, setPrintFormat] = useState("Standard");
  const [subject, setSubject] = useState(() =>
    t("store.mr.supplierEmail.defaultSubject", { name: materialRequestName }),
  );
  const [message, setMessage] = useState(() => t("store.mr.supplierEmail.defaultMessage"));
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    get("resource/Print Format", {
      filters: JSON.stringify({ doc_type: "Material Request", disabled: 0 }),
      fields: JSON.stringify(["name"]),
      order_by: "name asc",
      limit_page_length: 100,
    })
      .then((res) => {
        if (cancelled) return;
        const formats = (res.data || []).map((row) => ({ value: row.name, label: row.name }));
        setPrintFormats([{ value: "Standard", label: "Standard" }, ...formats.filter((row) => row.value !== "Standard")]);
      })
      .catch(() => {
        if (!cancelled) setPrintFormats([{ value: "Standard", label: "Standard" }]);
      });
    return () => {
      cancelled = true;
    };
  }, [show, materialRequestName, t]);

  const addSupplier = () => {
    if (!supplierCandidate || suppliers.includes(supplierCandidate)) return;
    setSuppliers((current) => [...current, supplierCandidate]);
    setSupplierCandidate("");
  };

  const send = async () => {
    if (!suppliers.length || !subject.trim() || !message.trim()) return;
    try {
      setLoading(true);
      const response = await post("method/erpnext_ui.api.create_and_email_material_request_rfq", {
        material_request_name: materialRequestName,
        suppliers: JSON.stringify(suppliers),
        print_format: printFormat,
        subject,
        message,
      });
      const result = response.message || {};
      const sentCount = result.sent?.length || 0;
      const failedCount = result.failed?.length || 0;
      toast[failedCount ? "warning" : "success"](
        t("store.mr.supplierEmail.result", {
          sent: sentCount,
          failed: failedCount,
          rfq: result.request_for_quotation,
        }),
      );
      onClose();
    } catch (e) {
      toast.error(e.message || t("store.mr.supplierEmail.failed"));
    } finally {
      setLoading(false);
    }
  };

  const preview = async () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      toast.error(t("store.mr.supplierEmail.previewPopupBlocked"));
      return;
    }
    try {
      setPreviewing(true);
      previewWindow.document.write(`<html><body style="font-family:sans-serif;padding:24px">${t("store.mr.supplierEmail.loadingPreview")}</body></html>`);
      const response = await post("method/erpnext_ui.api.get_material_request_rfq_print_preview", {
        material_request_name: materialRequestName,
        suppliers: JSON.stringify(suppliers),
        print_format: printFormat,
        subject,
        message,
      });
      const result = response.message || {};
      previewWindow.document.open();
      previewWindow.document.write(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>RFQ Print Preview</title></head><body style=\"margin:0\"></body></html>",
      );
      const frame = previewWindow.document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.title = t("store.mr.supplierEmail.preview");
      frame.style.cssText = "width:100vw;height:100vh;border:0";
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><style>${result.style || ""}</style><style>body{margin:24px}</style></head><body>${result.html || ""}</body></html>`;
      previewWindow.document.body.appendChild(frame);
      previewWindow.document.close();
    } catch (e) {
      previewWindow.close();
      toast.error(e.message || t("store.mr.supplierEmail.previewFailed"));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("store.mr.supplierEmail.title")}
      width="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="outline" onClick={preview} disabled={loading || previewing}>
            <Eye className="size-4" />
            {previewing ? t("store.mr.supplierEmail.loadingPreview") : t("store.mr.supplierEmail.preview")}
          </Button>
          <Button onClick={send} disabled={loading || !suppliers.length || !subject.trim() || !message.trim()}>
            {loading ? t("common.saving") : t("store.mr.supplierEmail.send")}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4 pb-6">
        <FormField label={t("store.mr.supplierEmail.supplier")}>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <LinkField
                doctype="Supplier"
                value={supplierCandidate}
                onChange={setSupplierCandidate}
                filters={{ disabled: 0 }}
                placeholder={t("store.mr.supplierEmail.chooseSupplier")}
              />
            </div>
            <Button type="button" variant="outline" onClick={addSupplier} disabled={!supplierCandidate}>
              <Plus />
              {t("store.mr.supplierEmail.addSupplier")}
            </Button>
          </div>
        </FormField>

        {suppliers.length ? (
          <ul className="flex flex-wrap gap-2" aria-label={t("store.mr.supplierEmail.selectedSuppliers")}>
            {suppliers.map((supplier) => (
              <li key={supplier} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                <span>{supplier}</span>
                <button type="button" onClick={() => setSuppliers((current) => current.filter((item) => item !== supplier))} aria-label={t("common.remove")}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("store.mr.supplierEmail.noSuppliers")}</p>
        )}

        <FormField label={t("store.mr.supplierEmail.printFormat")}>
          <FormSelect value={printFormat} onChange={setPrintFormat} options={printFormats} />
        </FormField>
        <FormField label={t("store.mr.supplierEmail.subject")} required>
          <Input maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </FormField>
        <FormField label={t("store.mr.supplierEmail.message")} required>
          <Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
        </FormField>
      </div>
    </AppModal>
  );
}
