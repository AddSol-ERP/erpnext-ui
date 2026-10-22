import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FolderTree, Pencil, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { useToast } from "../../../../context/ToastContext";
import { get, post } from "../../../../services/api";
import { deleteDocument, saveDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { focusFirstError } from "../../../../lib/formValidation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  PARAMETER_GROUP_DOCTYPE,
  PARAMETER_GROUP_REFERENCE,
  canDeleteGroup,
  decodeGroupName,
  groupNameFieldState,
  groupNameOf,
  groupUsageFilter,
  renamePayload,
  validateRename,
} from "../../../../lib/qualityParameterGroup";

/**
 * Create / view / rename / delete a `Quality Inspection Parameter Group`.
 *
 * THE ONE FIELD IS THE NAME
 * -------------------------
 * The doctype carries a single field, `group_name`, declared as
 * `autoname: "field:group_name"`. So `name === group_name`, and — the part
 * that matters — Frappe OVERWRITES `group_name` with the stored `name` on
 * every save:
 *
 *   frappe/model/base_document.py:1027-1033
 *       def _sync_autoname_field(self):
 *           """Keep autoname field in sync with `name`"""
 *           ...
 *           if fieldname and self.name and self.name != self.get(fieldname):
 *               self.set(fieldname, self.name)
 *
 * It runs from `_validate_data_fields()`, inside `validate()`. A PUT carrying
 * an edited `group_name` therefore answers 200 "saved" and keeps the old
 * value: the edit is discarded SILENTLY.
 *
 * So the name is not an editable field here — it is read-only, and changing it
 * is a RENAME through `frappe.client.rename_doc`, which also rewrites every
 * `Quality Inspection Parameter.parameter_group` that points at the group
 * (`frappe/model/rename_doc.py:169-170`).
 *
 * Deleting a group that parameters still reference is refused by Frappe
 * (`LinkExistsError`), so Delete is disabled while the group is in use rather
 * than offered as a button that can only fail.
 */

/** How many parameter rows to name in the "used by" list. */
const USAGE_PREVIEW_LIMIT = 50;



export default function ParameterGroupForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();
  const { t } = useTranslation();

  const isEdit = Boolean(name);
  const currentName = useMemo(
    () => (isEdit ? decodeGroupName(name) : ""),
    [isEdit, name],
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({ group_name: "" });

  /** Rename is a separate, explicit mode — the name is never a Save target. */
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  /** Parameters that reference this group, and the true count of them. */
  const [usage, setUsage] = useState([]);
  const [usageCount, setUsageCount] = useState(0);
  /**
   * Whether the usage query SUCCEEDED. A failed query means "unknown", not
   * "zero" — and an unknown count must not enable a Delete button that the
   * server will refuse. Fail closed.
   */
  const [usageKnown, setUsageKnown] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Always points at the newest document. The Save/Rename buttons are
  // registered into the page toolbar by an effect that deliberately does not
  // depend on `doc` (re-running it per keystroke would thrash the toolbar),
  // so the registered handler closes over the document as of an early render.
  // Handlers read through this ref.
  const docRef = useRef(doc);

  // Synced in an effect, not during render: the React Compiler lint rule
  // forbids mutating a ref while rendering. Handlers run after a commit.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    try {
      setLoading(true);
      const res = await get(
        `resource/${PARAMETER_GROUP_DOCTYPE}/${encodeURIComponent(currentName)}`,
      );
      setDoc({ group_name: groupNameOf(res.data) });
    } catch (e) {
      console.error(e);
      toast.error(t("quality.parameterGroupLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ================= USAGE ================= */
  const loadUsage = async (groupName) => {
    const filters = groupUsageFilter(groupName);
    try {
      const [listRes, countRes] = await Promise.all([
        get(`resource/${PARAMETER_GROUP_REFERENCE.doctype}`, {
          filters,
          fields: JSON.stringify(["name", "parameter"]),
          limit_page_length: USAGE_PREVIEW_LIMIT,
        }),
        get("method/frappe.client.get_count", {
          doctype: PARAMETER_GROUP_REFERENCE.doctype,
          filters,
        }),
      ]);
      setUsage(listRes.data || []);
      setUsageCount(Number(countRes.message) || 0);
      setUsageKnown(true);
    } catch (e) {
      // The group may still be perfectly deletable — but we cannot prove it,
      // so the count is treated as unknown and Delete stays disabled.
      console.error(e);
      setUsage([]);
      setUsageCount(0);
      setUsageKnown(false);
    }
  };

  /* ================= SAVE (new only) ================= */
  const handleSave = async () => {
    const value = (docRef.current.group_name || "").trim();
    if (!value) {
      setFieldErrors({ group_name: t("quality.parameterGroupNameRequired") });
      // The banner states the SITUATION; the field carries the message.
      // Both are on screen at once here, so repeating the sentence says it
      // twice.
      requestAnimationFrame(() =>
        focusFirstError({ group_name: t("quality.parameterGroupNameRequired") }),
      );
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      // `autoname: field:group_name` means the name IS the label, so this
      // creates a document literally called "value".
      await saveDocument({
        doctype: PARAMETER_GROUP_DOCTYPE,
        doc: { group_name: value },
      });
      toast.success(t("quality.parameterGroupSaved"));
      navigate("/quality/parameter-groups");
    } catch (e) {
      // A duplicate name is rejected by the doctype's `unique` flag; Frappe's
      // own message says so and is more useful than anything we could write.
      console.error(e);
      toast.error(e.message || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* ================= RENAME ================= */
  const startRename = () => {
    setFieldErrors({});
    setRenameValue(docRef.current.group_name || "");
    setRenaming(true);
  };

  const cancelRename = () => {
    setFieldErrors({});
    setRenaming(false);
  };

  const handleRename = async () => {
    const current = docRef.current.group_name || "";
    const next = renameValue.trim();
    const verdict = validateRename(current, next);

    if (!verdict.ok) {
      const message =
        verdict.reason === "blank"
          ? t("quality.parameterGroupNameRequired")
          : t("quality.parameterGroupSameName");
      setFieldErrors({ group_name: message });
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await post(
        "method/frappe.client.rename_doc",
        renamePayload({ oldName: current, newName: next }),
      );
      toast.success(t("quality.parameterGroupRenamed"));
      setRenaming(false);
      // The document's identity changed, so the URL has to change with it --
      // staying on the old one would 404 on the next reload.
      navigate(`/quality/parameter-groups/${encodeURIComponent(next)}`);
    } catch (e) {
      console.error(e);
      toast.error(e.message || t("quality.parameterGroupRenameFailed"));
    } finally {
      setSaving(false);
    }
  };

  /* ================= DELETE ================= */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDocument({ doctype: PARAMETER_GROUP_DOCTYPE, name: currentName });
      toast.success(t("quality.parameterGroupDeleted"));
      navigate("/quality/parameter-groups");
    } catch (e) {
      console.error(e);
      toast.error(e.message || t("common.deleteFailed"));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  /* ================= HEADER ================= */
  // Whether the group may be deleted right now. A group that parameters still
  // reference is refused by Frappe (`LinkExistsError`), and a usage count we
  // could not establish leaves us unable to promise the delete would succeed
  // -- so an unknown count is treated as "in use" and the button stays off.
  const canDelete = usageKnown && canDeleteGroup(usageCount);

  useEffect(() => {
    const actions = [];

    if (isEdit) {
      actions.push({
        label: t("common.back"),
        variant: "btn-outline-secondary",
        disabled: saving,
        onClick: () => navigate("/quality/parameter-groups"),
      });
      actions.push({
        label: t("common.delete"),
        variant: "btn-outline-danger",
        // Never offer a Delete that is guaranteed to fail.
        disabled: saving || loading || !canDelete,
        onClick: () => setConfirmDelete(true),
      });
    } else {
      actions.push({
        label: saving ? t("common.saving") : t("common.save"),
        variant: "btn-success",
        disabled: saving || loading,
        onClick: handleSave,
      });
    }

    setHeader({
      title: isEdit
        ? t("quality.parameterGroupTitle", { name: doc.group_name || currentName })
        : t("quality.newParameterGroup"),
      subtitle: isEdit
        ? t("quality.parameterGroupEditSubtitle")
        : t("quality.parameterGroupNewSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.parameterGroups"), path: "/quality/parameter-groups" },
        { label: isEdit ? doc.group_name || currentName : t("common.new") },
      ],
      actions,
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isEdit, loading, saving, doc, canDelete, currentName]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    if (!isEdit) return;
    // loadDoc / loadUsage only setState after awaited API responses.
    (async () => {
      await loadDoc();
      await loadUsage(currentName);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, currentName]);

  /* ================= UI ================= */
  const remaining = Math.max(usageCount - usage.length, 0);

  // Which state the name input is bound to. See `groupNameFieldState`.
  const nameField = groupNameFieldState({
    isEdit,
    renaming,
    docName: doc.group_name,
    renameValue,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 pt-4">

      {/* GROUP DETAILS */}
      <FormSection title={t("quality.basicDetails")} icon={FolderTree}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            label={t("quality.parameterGroupName")}
            required
            name="group_name"
            error={fieldErrors.group_name}
            hint={
              isEdit && !renaming
                ? t("quality.parameterGroupNameImmutable")
                : undefined
            }
          >
            <Input
              // `nameField` keeps the displayed value and the state that
              // `onChange` writes to in step. They were once out of step --
              // the new-group form showed `doc.group_name` and wrote
              // `renameValue` -- so typing was accepted and nothing appeared.
              value={nameField.value}
              // Read-only, not disabled: a disabled control is skipped by
              // `focusFirstError`, so a validation message on this field
              // could never move the caret to it.
              readOnly={nameField.readOnly}
              onChange={(e) => {
                if (nameField.source === "rename") {
                  setRenameValue(e.target.value);
                  return;
                }
                setDoc((current) => ({ ...current, group_name: e.target.value }));
              }}
              placeholder={t("quality.parameterGroupNamePlaceholder")}
            />
          </FormField>
        </div>

        {isEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {renaming ? (
              <>
                <Button variant="default" size="sm" onClick={handleRename} disabled={saving}>
                  {saving ? t("common.saving") : t("quality.rename")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelRename}
                  disabled={saving}
                >
                  <X />
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={startRename}
                // `loading` too: before the document arrives, the current name
                // is unknown, and a rename sent with an empty `old_name` is
                // a server error rather than a rename.
                disabled={saving || loading}
              >
                <Pencil />
                {t("quality.rename")}
              </Button>
            )}
          </div>
        )}
      </FormSection>

      {/* USED BY */}
      {isEdit && (
        <FormSection title={t("quality.parametersInGroup")} icon={ClipboardList}>
          {!usageKnown ? (
            <p className="text-sm text-muted-foreground">
              {t("quality.parameterGroupUsageUnknown")}
            </p>
          ) : usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("quality.noParametersInGroup")}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {usage.map((row) => (
                  <li
                    key={row.name}
                    className="truncate text-sm text-foreground"
                  >
                    {row.parameter || row.name}
                  </li>
                ))}
              </ul>
              {remaining > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("quality.parameterGroupMoreParameters", { count: remaining })}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("quality.parameterGroupInUse", { count: usageCount })}
              </p>
            </>
          )}
        </FormSection>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title={t("common.deleteConfirmTitle")}
        message={t("quality.parameterGroupDeleteConfirm", {
          name: doc.group_name || currentName,
        })}
      />
    </div>
  );
}
