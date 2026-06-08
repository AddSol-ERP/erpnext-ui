import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { getDoctypeConfig } from "../../config/doctypes";

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
          setLoadError("This document does not exist or you do not have permission to view it.");
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
     HEADER
  ------------------------------------------------------------------ */
  useEffect(() => {
    setHeader({
      title: decodedName || "Print Preview",
      subtitle: decodedDoctype,
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: hub.charAt(0).toUpperCase() + hub.slice(1), path: `/${hub}` },
        { label: decodedDoctype, path: `/${hub}/${encodeURIComponent(decodedDoctype)}` },
        { label: decodedName },
      ],
      actions: [
        {
          label: "Download PDF",
          variant: "btn-primary",
          icon: "bi bi-download",
          onClick: downloadPdf,
        },
        {
          label: "Print",
          variant: "btn-outline-primary",
          icon: "bi bi-printer",
          onClick: handlePrint,
        },
        {
          label: "Back",
          variant: "btn-outline-secondary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate(-1),
        },
      ],
    });
    return () => setHeader({});
  }, [doctype, name, hub]);

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

  /* ==================================================================
     RENDER
  ================================================================== */

  if (!decodedDoctype || !decodedName) {
    return (
      <div className="alert alert-danger m-4">
        <i className="bi bi-exclamation-triangle me-2"></i>
        Missing doctype or document name in the URL.
      </div>
    );
  }

  return (
    <div className="print-preview-container d-flex flex-column h-100">
      {/* Toolbar */}
      <div className="print-preview-toolbar flex-shrink-0 d-flex align-items-center gap-2 mb-2 pb-2 border-bottom">
        <button className="btn btn-sm btn-primary" onClick={downloadPdf}>
          <i className="bi bi-download me-1"></i> Download PDF
        </button>
        <button className="btn btn-sm btn-outline-primary" onClick={handlePrint}>
          <i className="bi bi-printer me-1"></i> Print
        </button>
        <span className="text-muted small ms-auto">
          {decodedDoctype} — {decodedName}
        </span>
      </div>

      {/* Native Frappe /printview page embedded in an iframe */}
      <div className="flex-grow-1 print-preview-frame">
        {loadError ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-4">
            <i className="bi bi-exclamation-triangle text-warning" style={{ fontSize: "3rem" }}></i>
            <h5 className="mt-3 text-muted">Document Not Available</h5>
            <p className="text-muted mb-3">{loadError}</p>
            <button className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left me-1"></i> Go back
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={printviewUrl}
            title={`${decodedDoctype} - ${decodedName}`}
            className="print-iframe"
            sandbox="allow-same-origin allow-forms allow-scripts"
            onLoad={handleIframeLoad}
            style={{
              width: "100%",
              height: "100%",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              background: "#fff",
            }}
          />
        )}
      </div>
    </div>
  );
}
