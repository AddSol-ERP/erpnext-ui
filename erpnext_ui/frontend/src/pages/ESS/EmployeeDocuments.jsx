import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { get, post, uploadFile } from "../../services/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { FileText, Trash2, Upload } from "lucide-react";

/**
 * Employee documents panel, rendered inside AppModal from the profile's
 * Documents action.
 *
 * Self-service only: the server derives the Employee from the logged-in session,
 * so there is no employee selector here and none on the API side either.
 *
 * The type list comes from the server (get_employee_document_types) rather than
 * being hardcoded in JavaScript, so the backend config stays the single source
 * of truth.
 *
 * This component deliberately renders no heading of its own -- AppModal owns the
 * title and the scrollable body. It also does NOT hide itself when no types are
 * configured: the trigger button lives in the page header, which cannot know the
 * type list without a second fetch, so an empty config shows an empty state here
 * instead.
 *
 * Props:
 *   onUploaded: optional callback fired after a successful upload. The server
 *     moves the Employee into "Pending HR Approval" on upload, so the parent
 *     must re-read the profile for the HR approval banner to appear. It MUST
 *     refresh without tearing down the modal -- see Profile.loadProfile's
 *     `silent` option, since a loading swap unmounts this whole subtree.
 */
export default function EmployeeDocuments({ onUploaded }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [types, setTypes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputs = useRef({});

  // Pure fetch, no setState, so both the mount effect and the post-action
  // refresh share one code path.
  const fetchAll = useCallback(async () => {
    const [configured, uploaded] = await Promise.all([
      get("method/erpnext_ui.ui_documents.get_employee_document_types"),
      get("method/erpnext_ui.ui_documents.list_employee_documents"),
    ]);

    return {
      types: Array.isArray(configured?.message) ? configured.message : [],
      documents: Array.isArray(uploaded?.message) ? uploaded.message : [],
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Every setState here is after an await, never synchronously in the effect
    // body, which is what the react-hooks/set-state-in-effect rule guards
    // against: a synchronous setState re-renders before the paint.
    (async () => {
      try {
        const { types, documents } = await fetchAll();
        if (cancelled) return;
        setTypes(types);
        setDocuments(documents);
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || t("ess.profile.documents.loadFailed"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchAll, t, toast]);

  const refresh = useCallback(async () => {
    const { types, documents } = await fetchAll();
    setTypes(types);
    setDocuments(documents);
  }, [fetchAll]);

  const handleUpload = async (type, file) => {
    if (!file) return;

    setBusyKey(type.type_key);
    try {
      const formData = new FormData();
      formData.append("type_key", type.type_key);
      formData.append("file", file);

      await uploadFile(
        "method/erpnext_ui.ui_documents.upload_employee_document",
        formData,
      );

      toast.success(t("ess.profile.documents.uploaded", { name: type.label }));
      await refresh();

      // Server moved us to "Pending HR Approval"; tell the parent so the banner
      // updates without the modal closing.
      await onUploaded?.();
    } catch (err) {
      toast.error(err?.message || t("ess.profile.documents.uploadFailed"));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (doc) => {
    setDeleting(true);
    try {
      await post("method/erpnext_ui.ui_documents.delete_employee_document", {
        file_name: doc.name,
      });

      toast.success(
        t("ess.profile.documents.deleted", { name: doc.display_name }),
      );
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      toast.error(err?.message || t("ess.profile.documents.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const pick = (type) => fileInputs.current[type.type_key]?.click();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t("ess.profile.documents.description")}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          {t("ess.profile.documents.loading")}
        </div>
      ) : !types.length ? (
        // The header button is always rendered, because the header does not
        // know the type list without a second fetch. Say so plainly instead of
        // showing an empty box.
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("ess.profile.documents.noneConfigured")}</EmptyTitle>
            <EmptyDescription>
              {t("ess.profile.documents.noneConfiguredHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {types.map((type) => {
            // Match by parsed type_key, or fall back to file_name prefix
            // (e.g. "[AADHAAR_CARD]...") in case the parse didn't capture it.
            const doc =
              documents.find(
                (item) =>
                  (item.type_key && item.type_key === type.type_key) ||
                  (item.file_name &&
                    item.file_name.startsWith(`[${type.type_key}]`)),
              ) || null;
            const busy = busyKey === type.type_key;

            return (
              <div
                key={type.type_key}
                className="flex flex-col rounded-lg border border-border p-3"
              >
                {/* No flex-wrap: a long file name must not push the action
                    buttons onto their own line, because that made each card a
                    different height. The left column truncates instead. */}
                <div className="flex flex-1 items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {type.label}
                    </div>
                    {doc ? (
                      <DocumentRow doc={doc} />
                    ) : (
                      <NotUploadedSlot
                        label={t("ess.profile.documents.notUploaded")}
                      />
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Always rendered so the Upload/Replace button sits in the
                        same place in every card; `invisible` (visibility:hidden)
                        keeps the layout while dropping it from tab order and the
                        accessibility tree when there is nothing to delete. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 p-0 ${doc ? "" : "invisible"}`}
                      disabled={!doc || busy || deleting}
                      onClick={() => setPendingDelete(doc)}
                      aria-label={t("ess.profile.documents.delete")}
                      tabIndex={doc ? 0 : -1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy || deleting}
                      onClick={() => pick(type)}
                    >
                      {busy ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {doc
                        ? t("ess.profile.documents.replace")
                        : t("ess.profile.documents.upload")}
                    </Button>
                  </div>
                </div>

                <input
                  ref={(el) => {
                    fileInputs.current[type.type_key] = el;
                  }}
                  type="file"
                  className="hidden"
                  accept={type.extensions.map((ext) => `.${ext}`).join(",")}
                  onChange={(event) => {
                    handleUpload(type, event.target.files?.[0]);
                    // Reset so re-picking the same file fires onChange again.
                    event.target.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Nested inside AppModal on purpose: the same shape ApprovalPreview uses
          (components/Approval/ApprovalPreview/index.jsx), so identity documents
          cannot be dropped on a single stray click. `loading` also blocks a
          double-confirm. */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        title={t("common.deleteConfirmTitle")}
        message={t("common.deleteConfirm", {
          name: pendingDelete?.display_name,
        })}
        loading={deleting}
      />
    </div>
  );
}

/**
 * Preview for a stored document.
 *
 * Images render from `file_url` directly rather than `thumbnail_url`: Frappe
 * only generates thumbnails when `make_thumbnail()` is called explicitly, and
 * nothing calls it on an ordinary save, so thumbnail_url would be empty.
 * CSS-constrained instead, which keeps this to zero extra backend work.
 *
 * Non-images (PDF, docx) get an icon plus a link to open in a new tab -- an
 * <iframe> preview would need the browser's PDF viewer and does nothing useful
 * for .docx.
 */
function DocumentRow({ doc }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      {doc.is_image ? (
        <img
          src={doc.file_url}
          alt={doc.display_name}
          className="h-16 w-16 shrink-0 rounded border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-border">
          <FileText className="h-6 w-6" />
        </span>
      )}

      <a
        href={doc.file_url}
        target="_blank"
        rel="noopener noreferrer"
        // min-w-0 + flex-1 are what actually let `truncate` take effect inside a
        // flex row; without them a long file name keeps widening the row and
        // shoves the action buttons onto the next line.
        className="min-w-0 flex-1 truncate font-medium text-foreground underline-offset-2 hover:underline"
        title={doc.display_name}
      >
        {doc.display_name}
      </a>
    </div>
  );
}

/**
 * Placeholder for a document type with nothing uploaded yet.
 *
 * Occupies exactly the same 64px box as DocumentRow's thumbnail, which is what
 * keeps every card the same height in the two-column grid. Without it, cards
 * with a file were ~64px taller than the empty ones and the grid looked ragged.
 */
function NotUploadedSlot({ label }) {
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="h-16 w-16 shrink-0 rounded border border-dashed border-border" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  );
}
