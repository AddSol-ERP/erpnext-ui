import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const handlers = {}, calls = [];
let captured, submitted;
const row = { name: "ROW", custom_rate_per_pricing_uom: 42 };
const frm = { doctype: "Purchase Order", doc: { name: "PO", docstatus: 1, items: [row] }, fields_dict: {}, reload_doc() {} };
function Dialog(config) { captured = config; return { show() {} }; }
const context = { __: (value) => value, locals: {}, frappe: {
  ui: { Dialog, form: { on: (doctype, events) => { handlers[doctype] = events; } } },
  call: (args) => calls.push(args),
} };
context.erpnext = { utils: { update_child_items() {
  new context.frappe.ui.Dialog({ fields: [{ fieldname: "trans_items", fieldtype: "Table", fields: [], data: [{ docname: "ROW", item_code: "SHEET", qty: 2 }] }] });
} } };
vm.runInNewContext(fs.readFileSync(new URL("../erpnext_ui/public/js/uom_pricing_desk.js", import.meta.url), "utf8"), context);
handlers["Purchase Order"].refresh(frm);
context.erpnext.utils.update_child_items({ frm, child_docname: "items" });
assert.equal(context.frappe.ui.Dialog, Dialog, "Original dialog constructor is restored");
assert(captured.fields[0].fields.some((field) => field.fieldname === "custom_rate_per_pricing_uom"));
assert.equal(captured.fields[0].data[0].custom_rate_per_pricing_uom, 42);
captured.update_items.call({ get_values: () => ({ trans_items: captured.fields[0].data }), hide() { submitted = true; } });
assert.equal(calls[0].method, "erpnext_ui.purchase_order_update.update_items");
assert.equal(calls[0].args.trans_items[0].custom_rate_per_pricing_uom, 42);
calls[0].callback();
assert(submitted);
console.log("Submitted PO update dialog pricing checks passed");
