/* Add rules from an operation row while keeping Frappe's table on the parent. */
function add_approval_row_button(frm, cdt, cdn) {
  if (frm.doc.docstatus !== 0 || !frm.get_field("custom_approval_rules")) return;
  const row = locals[cdt]?.[cdn];
  const grid = frm.fields_dict.operations?.grid;
  const gridRow = grid?.grid_rows_by_docname?.[cdn];
  const wrapper = gridRow?.grid_form?.wrapper;
  if (!row || !wrapper || wrapper.find(".ui-add-operation-approval").length) return;
  const button = $("<button type='button' class='btn btn-default btn-sm ui-add-operation-approval'></button>")
    .text(__("Add approval rule"));
  button.on("click", () => {
    if (!row.operation) {
      frappe.msgprint(__("Select an operation first."));
      return;
    }
    const duplicates = (frm.doc.operations || []).filter((item) => item.operation === row.operation);
    if (duplicates.length > 1 && row.__islocal) {
      frappe.msgprint(__("Save the document before adding rules to repeated operations."));
      return;
    }
    const rule = frm.add_child("custom_approval_rules", {
      operation: row.operation,
      operation_row: row.name,
    });
    frm.refresh_field("custom_approval_rules");
    gridRow.hide_form();
    frm.scroll_to_field("custom_approval_rules");
    frm.fields_dict.custom_approval_rules.grid.grid_rows_by_docname[rule.name]?.toggle_view(true);
  });
  wrapper.append($("<div class='mb-3'></div>").append(button));
}

frappe.ui.form.on("BOM Operation", { form_render: add_approval_row_button });
frappe.ui.form.on("Work Order Operation", { form_render: add_approval_row_button });
