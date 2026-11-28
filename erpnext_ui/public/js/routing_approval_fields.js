/* Routing uses BOM Operation rows, but approval rules belong to Operation/BOM. */
frappe.ui.form.on("Routing", {
  refresh(frm) {
    const grid = frm.fields_dict.operations?.grid;
    if (!grid) return;
    for (const field of ["custom_approval_stage", "custom_approval_role", "custom_approval_reason"]) {
      if (frappe.meta.has_field("BOM Operation", field)) grid.update_docfield_property(field, "hidden", 1);
    }
    frm.refresh_field("operations");
  },
});
