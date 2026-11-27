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

frappe.ui.form.on("UI Operation Approval Rule", {
  form_render(frm, cdt, cdn) {
    if (!["BOM", "Work Order"].includes(frm.doctype)) return;
    const grid = frm.fields_dict.custom_approval_rules?.grid;
    const wrapper = grid?.grid_rows_by_docname?.[cdn]?.grid_form?.wrapper;
    if (!wrapper || wrapper.find(".ui-select-approval-operation").length) return;
    const current = locals[cdt]?.[cdn];
    const selected = (frm.doc.operations || []).find((row) => row.name === current?.operation_row);
    const container = $("<div class='mb-3'></div>");
    const label = $("<span class='me-2'></span>").text(selected ? __("Operation {0}: {1}", [selected.idx, selected.operation]) : __("No operation selected"));
    container.append(label);
    if (frm.doc.docstatus === 0) {
      const button = $("<button type='button' class='btn btn-default btn-sm ui-select-approval-operation'></button>").text(__("Select operation"));
      button.on("click", () => {
        const rows = (frm.doc.operations || []).filter((row) => row.operation);
        if (!rows.length) { frappe.msgprint(__("Add an operation first.")); return; }
        const choices = rows.map((row, index) => ({ row, label: `${index + 1}. ${row.operation}` }));
        frappe.prompt([{ fieldname: "choice", label: __("Operation"), fieldtype: "Select", options: choices.map((choice) => choice.label).join("\n"), reqd: 1 }], async ({ choice }) => {
          const picked = choices.find((entry) => entry.label === choice)?.row;
          if (!picked) return;
          if (picked.__islocal && rows.filter((row) => row.operation === picked.operation).length > 1) {
            frappe.msgprint(__("Save the document before adding rules to repeated operations."));
            return;
          }
          await frappe.model.set_value(cdt, cdn, { operation: picked.operation, operation_row: picked.name });
          label.text(__("Operation {0}: {1}", [picked.idx, picked.operation]));
        }, __("Select operation"), __("Select"));
      });
      container.append(button);
    } else {
      container.addClass("ui-select-approval-operation");
    }
    wrapper.append(container);
  },
});
