import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, FileText, Paperclip, Trash2 } from "lucide-react";
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
 * Receipt and Plate Offcut forms, Stock Entry, the Quality Inspection form,
 * and the ESS leave/expense forms, and it asks the server what may be attached
 * rather than holding a list of its own. The ERPNext desk script in
 * addsol_nl_custom renders against the same four endpoints.
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
 *
 * PICKING IS TWO STEPS. Selecting files (the type's "Add files" button, which
 * takes several at once, or its "Camera" button for image types, which takes
 * one) only STAGES them; each staged file then shows its own name + remark row
 * and is uploaded on confirmation. Nothing uploads on selection alone: the
 * name the operator types must land on the file they typed it for, and with a
 * multi-select there is no such thing as "the selected file". Staging is an
 * INLINE block, never a nested modal -- the store module's invariant of
 * exactly one dialog applies to this surface too.
 *
 * The file name is an optional OVERRIDE of the server's decided name
 * (`[{TYPE_KEY}]{sequence}-{original}`): the draft is prefilled with the
 * upload's own stem, and whatever the operator keeps or types is sent as the
 * stem -- the prefix, sequence and extension stay server-owned because the
 * list and delete endpoints parse the prefix.
 */
/** Image-only types are the ones a phone can capture at the point of work. */
function isImageType(type) {
  const exts = (type?.extensions || []).map((e) => e.toLowerCase());
  return (
    exts.length > 0 &&
    exts.every((e) => ["jpg", "jpeg", "png", "webp", "heic"].includes(e))
  );
}

/** The display name of a stored file: `[TYPE_KEY]3-Gate pass.jpg` reads as "Gate pass.jpg". */
function displayName(storedName) {
  return (storedName || "").replace(/^\[[A-Z0-9_]+\]\d+-/, "");
}

/** The stem the server would use if the operator does not override it. */
function stemOf(file) {
  return (file?.name || "").replace(/\.[^.]+$/, "");
}

export function AttachmentsPanel({
  doctype,
  docname,
  readOnly = false,
  onChange,
}) {
  const { t } = useTranslation();
  const [config, setConfig] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [error, setError] = useState("");
  const inputs = useRef({});

  // The staged batch and the drafts for its CURRENT file. The drafts live
  // beside the queue rather than in it so advancing resets them without
  // touching the staged File objects.
  const [staged, setStaged] = useState([]);
  const [stagedIndex, setStagedIndex] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [remarkDraft, setRemarkDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const canAttach = Boolean(docname) && !readOnly;
  const current = staged[stagedIndex] || null;

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

  const seedDrafts = (file) => {
    setNameDraft(stemOf(file));
    setRemarkDraft("");
  };

  const stage = (type, fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    setStaged(picked.map((file) => ({ type, file })));
    setStagedIndex(0);
    seedDrafts(picked[0]);
  };

  const confirmStaged = async () => {
    if (!current || uploading) return;
    setUploading(true);
    setError("");
    try {
      await uploadAttachment({
        doctype,
        docname,
        typeKey: current.type.type_key,
        file: current.file,
        // A cleared input means "keep the decided name" -- the field is a
        // deliberate override, never a required second name to invent.
        fileName: nameDraft.trim() || undefined,
        remark: remarkDraft.trim() || undefined,
      });
      const rest = staged.filter((_, i) => i !== stagedIndex);
      if (rest.length) {
        setStaged(rest);
        setStagedIndex(Math.min(stagedIndex, rest.length - 1));
        seedDrafts(rest[Math.min(stagedIndex, rest.length - 1)].file);
      } else {
        setStaged([]);
        setStagedIndex(0);
      }
      await load();
      onChange?.();
    } catch (e) {
      setError(e?.message || t("attachments.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const discardStaged = () => {
    const rest = staged.filter((_, i) => i !== stagedIndex);
    const nextIndex = Math.min(stagedIndex, rest.length - 1);
    setStaged(rest);
    setStagedIndex(rest.length ? nextIndex : 0);
    if (rest.length) seedDrafts(rest[nextIndex].file);
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

  const inputKey = (typeKey, kind) => `${kind}:${typeKey}`;

  return (
    <div className="flex flex-col gap-3 py-3" data-testid="attachments-panel">
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
                    alt={displayName(file.file_name)}
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
                </a>
              )}
              <span className="block px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {file.label}
              </span>
              <span
                className="block truncate px-2 text-xs"
                title={displayName(file.file_name)}
              >
                {displayName(file.file_name)}
              </span>
              {file.remark ? (
                <span className="block line-clamp-2 px-2 pb-1 text-[11px] text-muted-foreground">
                  {file.remark}
                </span>
              ) : (
                <span className="block pb-1" />
              )}
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

      {/* The staging row for the current file. Inline, never a second modal. */}
      {current ? (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-muted/30 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              {t("attachments.upload")} — {current.type.label}
            </span>
            {staged.length > 1 ? (
              <span className="text-xs text-muted-foreground">
                {t("attachments.stagedOf", {
                  current: stagedIndex + 1,
                  total: staged.length,
                })}
              </span>
            ) : null}
            <span className="w-full truncate text-xs text-muted-foreground">
              {current.file.name}
            </span>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("attachments.nameLabel")}
            <input
              type="text"
              value={nameDraft}
              maxLength={80}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("attachments.remarkLabel")}
            <input
              type="text"
              value={remarkDraft}
              maxLength={140}
              onChange={(e) => setRemarkDraft(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={discardStaged}
              disabled={uploading}
            >
              {t("attachments.discard")}
            </Button>
            <Button size="sm" onClick={confirmStaged} disabled={uploading}>
              {uploading ? t("common.uploading") : t("attachments.upload")}
            </Button>
          </div>
        </div>
      ) : null}

      {canAttach
        ? config.map((type) => (
            <div
              key={type.type_key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {type.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("attachments.hint", {
                    mb: type.max_size_mb,
                    ext: type.extensions.join(", "),
                  })}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <input
                  ref={(el) => {
                    inputs.current[inputKey(type.type_key, "files")] = el;
                  }}
                  type="file"
                  multiple
                  className="hidden"
                  accept={acceptFor(type)}
                  onChange={(event) => {
                    stage(type, event.target.files);
                    // Reset so re-picking the SAME files fires onChange again --
                    // a second batch with the same phone names is the common case.
                    event.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    inputs.current[inputKey(type.type_key, "files")]?.click()
                  }
                >
                  {t("attachments.addFiles")}
                </Button>
                {isImageType(type) ? (
                  <>
                    {/* A SEPARATE input for the camera: `capture` on the multi
                        input would fight `multiple`, and the whole point of the
                        camera button is one deliberate shot. `capture` remains
                        a HINT the browser may ignore. */}
                    <input
                      ref={(el) => {
                        inputs.current[inputKey(type.type_key, "camera")] = el;
                      }}
                      type="file"
                      accept={acceptFor(type)}
                      capture="environment"
                      className="hidden"
                      onChange={(event) => {
                        stage(type, event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t("attachments.camera")}
                      onClick={() =>
                        inputs.current[
                          inputKey(type.type_key, "camera")
                        ]?.click()
                      }
                    >
                      <Camera className="size-3.5" />
                      {t("attachments.camera")}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={t("common.deleteConfirmTitle")}
        message={t("attachments.deleteConfirm", {
          label: pendingDelete?.label,
        })}
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
 * TWO modes, chosen by whether `onSubmit` is passed:
 *
 *   - `onSubmit` (pre-submit attach step, e.g. Purchase Receipt): the footer is
 *     Cancel + Submit. The OLD footer was Skip ("Submit without attaching") +
 *     a prominent Done that only CLOSED the dialog -- so attaching a weighbridge
 *     ticket, clicking Done, and landing back on the untouched draft was the
 *     designed behaviour, and Submit looped straight back into this dialog.
 *     Cancel (and the X / Esc) is the deliberate "don't submit yet" exit;
 *     Submit with zero files attached is the no-camera escape hatch that Skip
 *     used to provide, so the two buttons collapsed into these two.
 *   - no `onSubmit` (browse mode, e.g. the header Attach action): a single Done
 *     closes. Nothing here may submit from a dialog the user opened just to
 *     look at the files.
 */
export function AttachDialog({ show, onClose, doctype, docname, onSubmit }) {
  const { t } = useTranslation();
  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("attachments.dialogTitle", { doctype })}
      width="lg"
      footer={
        onSubmit ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={onSubmit}>{t("common.submit")}</Button>
          </>
        ) : (
          <Button onClick={onClose}>{t("common.done")}</Button>
        )
      }
    >
      {/* onChange is a "something changed, re-render me" signal, NOT "finish".
          Passing the dialog's submit callback here meant the first successful
          UPLOAD submitted the parent document -- so attaching a weighbridge
          ticket on a Purchase Receipt committed the receipt, while a second
          upload could not attach at all because the document was already gone
          from this dialog. It is the panel's own state that needs refreshing,
          and it already does that itself, so the parent is told nothing. */}
      <AttachmentsPanel doctype={doctype} docname={docname} />
    </AppModal>
  );
}

export default AttachmentsPanel;
