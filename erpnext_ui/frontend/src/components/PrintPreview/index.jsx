import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { getDoctypeConfig } from "../../config/doctypes";
import { Button } from "@/components/ui/button";
import { Download, Printer, TriangleAlert } from "lucide-react";

/** Extract the hub name from the first segment of the current path. */
function useHub() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

/**
 * PrintPreview
 *
 * Embeds the native Frappe `/printview` page in an iframe so the document
 * renders using the print template configured on the doctype.
 * Read-only by design — no edit capability.
 */
export default function PrintPreview() {
  const { doctype, name } = useParams();
  const hub = useHub();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const iframeRef = useRef(null);

  const decodedDoctype = decodeURIComponent(doctype || "");
  const decodedName = decodeURIComponent(name || "");

  /* ------------------------------------------------------------------
     PRINT FORMAT FROM DOCTYPE CONFIG
  ------------------------------------------------------------------ */
  const doctypeConfig = getDoctypeConfig(decodedDoctype);
  const printFormat = doctypeConfig.printFormat || "";

  /* ------------------------------------------------------------------
     IFRAME LOAD ERROR DETECTION
  ------------------------------------------------------------------ */
  const [loadError, setLoadError] = useState("");

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const title = doc.title || "";
        const bodyText = doc.body?.innerText?.slice(0, 500) || "";
        const errorKeywords = ["not found", "cannot be accessed", "does not exist", "error", "oops"];
        const isError = errorKeywords.some(
          (kw) => title.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw)
        );
        // Also check for Frappe's standard 404 page indicator
        const hasErrorPage = doc.querySelector(".page-card") ||
                             doc.querySelector(".error-page") ||
                             doc.querySelector(".frappe-404");
        if (isError || hasErrorPage) {
          setLoadError(t("print.loadError"));
        }
      }
    } catch {
      // Cross-origin access blocked — silently ignore
    }
  };

  /**
   * Build the native Frappe printview URL.
   * Uses the doctype's configured print format if specified,
   * otherwise omits "format" so Frappe falls back to its own default.
   */
  const printviewUrl =
    `/printview?doctype=${encodeURIComponent(decodedDoctype)}` +
    `&name=${encodeURIComponent(decodedName)}` +
    (printFormat ? `&format=${encodeURIComponent(printFormat)}` : "");

  /* ------------------------------------------------------------------
     DOWNLOAD / PRINT HELPERS
  ------------------------------------------------------------------ */
  const downloadPdf = () => {
    const url =
      `/api/method/frappe.utils.print_format.download_pdf` +
      `?doctype=${encodeURIComponent(decodedDoctype)}` +
      `&name=${encodeURIComponent(decodedName)}` +
      (printFormat ? `&format=${encodeURIComponent(printFormat)}` : "");
    window.open(url, "_blank");
  };

  const handlePrint = () => {
    // Open printview in a new window for native browser printing.
    // This is more reliable than iframe.contentWindow.print() across browsers.
    window.open(printviewUrl, "_blank");
  };

  /* ------------------------------------------------------------------
     HEADER
  ------------------------------------------------------------------ */
  useEffect(() => {
    setHeader({
      title: decodedName || t("print.previewTitle"),
      subtitle: decodedDoctype,
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: hub.charAt(0).toUpperCase() + hub.slice(1), path: `/${hub}` },
        { label: decodedDoctype, path: `/${hub}/${encodeURIComponent(decodedDoctype)}` },
        { label: decodedName },
      ],
      actions: [
        {
          label: t("print.downloadPdf"),
          variant: "btn-primary",
          onClick: downloadPdf,
        },
        {
          label: t("common.print"),
          variant: "btn-outline-primary",
          onClick: handlePrint,
        },
        {
          label: t("common.back"),
          variant: "btn-outline-secondary",
          onClick: () => navigate(-1),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, name, hub]);

  /* ==================================================================
     RENDER
  ================================================================== */

  if (!decodedDoctype || !decodedName) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
        <TriangleAlert className="me-2 inline size-4" />
        {t("print.missingParams")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-border pb-2">
        <Button size="sm" onClick={downloadPdf}>
          <Download className="size-4" />
          {t("print.downloadPdf")}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="size-4" />
          {t("common.print")}
        </Button>
        <span className="ms-auto truncate text-sm text-muted-foreground">
          {decodedDoctype} — {decodedName}
        </span>
      </div>

      {/* Native Frappe /printview page embedded in an iframe */}
      <div className="min-h-0 flex-1">
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <TriangleAlert className="size-12 text-amber-600" />
            <h5 className="mt-3 text-lg font-semibold text-muted-foreground">
              {t("print.notAvailable")}
            </h5>
            <p className="mb-3 text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => navigate(-1)}>
              {t("print.goBack")}
            </Button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={printviewUrl}
            title={`${decodedDoctype} - ${decodedName}`}
            className="h-full w-full rounded-md border border-border bg-white"
            sandbox="allow-same-origin allow-forms allow-scripts"
            onLoad={handleIframeLoad}
          />
        )}
      </div>
    </div>
  );
}
