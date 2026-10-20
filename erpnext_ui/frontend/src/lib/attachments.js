import { get, post, uploadFile } from "../services/api";

/**
 * The one attachment API, shared by every surface that can attach to a
 * transaction: the Purchase Receipt and Plate Offcut forms, Stock Entry, the
 * Quality Inspection list, AND the ERPNext desk script in addsol_nl_custom.
 *
 * All four call the same four endpoints and render the type list that
 * `getAttachmentConfig` returns. Nothing here hardcodes an extension or a size --
 * the server owns those, and a second copy is a second thing to be wrong.
 *
 * The file NAME is built server-side (`[{TYPE_KEY}]{sequence}-{original}`), so
 * the sequence that keeps two phone photos called IMG_0001.jpg apart cannot
 * diverge between the two clients.
 */

const NS = "erpnext_ui.ui_documents";

/**
 * What may be attached to a doctype.
 *
 * @returns {Promise<{doctype: string, types: Array<{type_key: string, label: string, extensions: string[], max_size_mb: number}>}>}
 */
export async function fetchAttachmentConfig(doctype) {
  const res = await get(`method/${NS}.get_attachment_config`, { doctype });
  return res?.message || { doctype, types: [] };
}

/**
 * Every file already attached to one document, newest first.
 *
 * @returns {Promise<Array<object>>}
 */
export async function fetchAttachments(doctype, docname) {
  if (!docname) return [];
  const res = await get(`method/${NS}.list_document_attachments`, {
    doctype,
    docname,
  });
  return res?.message?.files || [];
}

/**
 * Upload one file against a SAVED document.
 *
 * A `File` is attached by name, so an unsaved document has nothing to attach
 * to and the server refuses it. Callers are expected to save first rather than
 * having this quietly save on the operator's behalf.
 *
 * `fileName` is the operator's optional name for the STEM; the server keeps
 * the `[TYPE_KEY]` prefix, the collision-proof sequence and the validated
 * extension, so a custom name can never orphan a file from the list or delete
 * endpoints. `remark` is stored on File.ui_remark, a Custom Field (core File
 * has no free-text column).
 *
 * @returns {Promise<object>} the created File descriptor
 */
export function uploadAttachment({ doctype, docname, typeKey, file, fileName, remark }) {
  const formData = new FormData();
  formData.append("doctype", doctype);
  formData.append("docname", docname);
  formData.append("type_key", typeKey);
  formData.append("file", file);
  if (fileName) formData.append("file_name", fileName);
  if (remark) formData.append("remark", remark);
  return uploadFile(`method/${NS}.upload_document`, formData);
}

/** Remove one attachment. Requires write on the PARENT document, not just the file. */
export function deleteAttachment(fileName) {
  return post(`method/${NS}.delete_document_attachment`, { file_name: fileName });
}

/** The `accept` attribute for one type, e.g. ".pdf,.jpg,.jpeg,.png". */
export function acceptFor(type) {
  return (type?.extensions || []).map((ext) => `.${ext}`).join(",");
}