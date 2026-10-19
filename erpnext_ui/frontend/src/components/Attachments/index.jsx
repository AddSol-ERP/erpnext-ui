import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Paperclip, Trash2 } from "lucide-react";
// The roundabout path is deliberate and matches every other modal in this app
// (`../../components/AppModal`). The smoke suite's SSR_MODAL_STUB alias matches on
// the string "components/AppModal", so the short "../AppModal" resolves to the
// same file while SILENTLY BYPASSING the stub -- and then Radix portals the
// dialog and every assertion inside it renders against an empty string and
// passes for the wrong reason. Use the long form.
import AppModal from "../../components/AppModal";
import ConfirmDialog from "../ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  acceptFor,
  deleteAttachment,
  fetchAttachmentConfig,
  fetchAttachments,
  uploadAttachment,
} from "../../lib/attachments";

/**
 * Attach supporting documents to a transaction.
 *
 * GLOBAL and doctype-agnostic on purpose: the same panel serves the Purchase
 * Receipt and Plate Offcut forms, Stock Entry, and the Quality Inspection list,
 * and it asks the server what may be attached rather than holding a list of its
 * own. The ERPNext desk script in addsol_nl_custom renders against the same four
 * endpoints.
 *
 * Images preview from `file_url` directly. `thumbnail_url` is deliberately not
 * used: Frappe only fills it when `make_thumbnail()` is called explicitly and
 * nothing calls it on an ordinary save, so it is usually empty. Non-images get
 * an icon and a link rather than an <iframe>, which would depend on the
 * browser's PDF viewer and does nothing useful for a spreadsheet.
 *
 * An UNSAVED document cannot be attached to -- a `File` is linked by name, so
 * there is no name to link to. The panel says so instead of offering a button
 * that is guaranteed to fail.
 */
/** Image-only types are the ones a phone can capture at the point of work. */
function isImageType(type) {
  const exts = (type?.extensions || []).map((e) => e.toLowerCase());
  return exts.length > 0 && exts.every((e) => ["jpg", "jpeg", "png", "webp", "heic"].includes(e));
}

export function AttachmentsPanel({ doctype, docname, readOnly = false, onChange }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState("");
  const inputs = useRef({});

  const canAttach = Boolean(docname) && !readOnly;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cfg, list] = await Promise.all([
        fetchAttachmentConfig(doctype),
        fetchAttachments(doctype, docname),
      ]);
      setConfig(cfg.types || []);
      setFiles(list);
    } catch (e) {
      setError(e?.message || t("attachments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [doctype, docname, t]);

  useEffect(() => {
    // `load` setStates only after an awaited API response; the rule
    // conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handlePick = async (type, file) => {
    if (!file) return;
    setBusyKey(type.type_key);
    setError("");
    try {
      await uploadAttachment({
        doctype,
        docname,
        typeKey: type.type_key,
        file,
      });
      await load();
      onChange?.();
    } catch (e) {
      setError(e?.message || t("attachments.uploadFailed"));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setError("");
    try {
      await deleteAttachment(pendingDelete.name);
      setPendingDelete(null);
      await load();
      onChange?.();
    } catch (e) {
      setError(e?.message || t("attachments.deleteFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="attachments-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {t("attachments.title", { doctype })}
        </span>
      </div>

      {!docname ? (
        <p className="text-xs text-muted-foreground">
          {t("attachments.saveFirst")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {files.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((file) => (
            <li
              key={file.name}
              className="group relative overflow-hidden rounded-md border border-border bg-muted/30"
            >
              {file.is_image ? (
                <a href={file.file_url} target="_blank" rel="noreferrer">
                  <img
                    src={file.file_url}
                    alt={file.label}
                    className="h-24 w-full object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <a
                  href={file.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-24 w-full flex-col items-center justify-center gap-1 p-2 text-center"
                >
                  <FileText className="size-5 text-muted-foreground" />
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {file.label}
                  </span>
                </a>
              )}
              <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">
                {file.label}
              </span>
              {!readOnly ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t("attachments.remove", { label: file.label })}
                  className="absolute end-1 top-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => setPendingDelete(file)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {loading ? t("common.loading") : t("attachments.none")}
        </p>
      )}

      {canAttach
        ? config.map((type) => (
            <div key={type.type_key} className="flex items-center gap-2">
              <input
                ref={(el) => {
                  inputs.current[type.type_key] = el;
                }}
                type="file"
                className="hidden"
                accept={acceptFor(type)}
                /* capture is a HINT, not a filter -- the browser may ignore it,
                   and iOS honours it only where the OS offers a camera choice.
                   It is set per-type rather than globally because offering a
                   camera for "Weighbridge Ticket" is noise. Image-only types
                   get it; a PDF ticket is picked from the gallery instead. */
                capture={isImageType(type) ? "environment" : undefined}
                onChange={(event) => {
                  handlePick(type, event.target.files?.[0]);
                  // Reset so re-picking the SAME file fires onChange again --
                  // a second photo with the same phone name is the common case.
                  event.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busyKey === type.type_key}
                onClick={() => inputs.current[type.type_key]?.click()}
              >
                {busyKey === type.type_key
                  ? t("common.uploading")
                  : t("attachments.add", { label: type.label })}
              </Button>
              <span className="truncate text-xs text-muted-foreground">
                {t("attachments.hint", {
                  mb: type.max_size_mb,
                  ext: type.extensions.join(", "),
                })}
              </span>
            </div>
          ))
        : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={t("common.deleteConfirmTitle")}
        message={t("attachments.deleteConfirm", { label: pendingDelete?.label })}
      />
    </div>
  );
}

/**
 * The attach step as a dialog, for surfaces with nowhere to put a panel.
 *
 * `AppModal`, not `Sheet`: the smoke suite stubs AppModal via SSR_MODAL_STUB=1,
 * so what the dialog contains can be asserted at all. A Radix Sheet renders
 * through a Portal and would be an empty string under renderToString.
 *
 * The footer carries a Skip path on purpose. This appears immediately before a
 * submit, so making it mandatory would mean a device with no camera could not
 * complete the transaction at all.
 */
export function AttachDialog({ show, onClose, doctype, docname, onSkip }) {
  const { t } = useTranslation();
  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("attachments.dialogTitle", { doctype })}
      width="lg"
      footer={
        <>
          {onSkip ? (
            <Button variant="ghost" onClick={onSkip}>
              {t("attachments.skip")}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t("common.done")}</Button>
        </>
      }
    >
      {/* onChange is a "something changed, re-render me" signal, NOT "finish".
          Passing onSkip here meant the first successful UPLOAD submitted the
          parent document -- so attaching a weighbridge ticket on a Purchase
          Receipt committed the receipt, while a second upload could not attach
          at all because the document was already gone from this dialog. It is
          the panel's own state that needs refreshing, and it already does that
          itself, so the parent is told nothing. */}
      <AttachmentsPanel doctype={doctype} docname={docname} />
    </AppModal>
  );
}

export default AttachmentsPanel;