import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const handlers = {}, requests = [];
let writes = 0;
const row = { name: "ROW-1", doctype: "Purchase Order Item", item_code: "SHEET", qty: 10, custom_chargeable_qty: 19, custom_rate_per_pricing_uom: 80 };
const frm = { doctype: "Purchase Order", doc: { docstatus: 0, items: [row] }, fields_dict: {} };
const context = { __: (text) => text, locals: { "Purchase Order Item": { "ROW-1": row } }, frappe: {
  ui: { form: { on: (doctype, events) => { handlers[doctype] = events; } } },
  call: (request) => requests.push(request),
  model: { set_value: (_doctype, _name, values) => { writes++; Object.assign(row, values); } },
} };
vm.runInNewContext(fs.readFileSync(new URL("../erpnext_ui/public/js/uom_pricing_desk.js", import.meta.url), "utf8"), context);
const reply = (index, qty) => requests[index].callback({ message: { enabled: true, pricing_uom: "Square Metre", calculated_chargeable_qty: qty } });
handlers["Purchase Order"].refresh(frm);
assert.equal(requests.length, 0, "refresh must display persisted values without fetching previews");
assert.equal(writes, 0, "refresh after save must not dirty the PO");
handlers["Purchase Order Item"].item_code(frm, row.doctype, row.name);
reply(0, 20);
assert.equal(row.custom_estimated_chargeable_qty, 20);
assert.equal(row.custom_estimated_pricing_amount, 1600);
assert.equal(row.custom_chargeable_qty, 19, "estimated quantity must never replace the entered measure");
row.custom_chargeable_qty = 18;
handlers["Purchase Order Item"].custom_chargeable_qty(frm, row.doctype, row.name);
reply(1, 20);
assert.equal(row.custom_estimated_chargeable_qty, 20);
assert.equal(row.custom_chargeable_qty, 18);
row.qty = 12;
handlers["Purchase Order Item"].qty(frm, row.doctype, row.name);
reply(2, 24);
reply(1, 20);
assert.equal(row.custom_estimated_chargeable_qty, 24, "stale replies must not replace the latest estimate");
frm.doc.docstatus = 1;
handlers["Purchase Order"].refresh(frm);
assert.equal(requests.length, 3, "submitted documents must keep their stored estimate");
assert.ok(handlers["Supplier Quotation Item"] && handlers["Sales Order Item"] && handlers["Delivery Note Item"] && handlers["Quotation Item"]);
frm.doc.docstatus = 0;
row.qty = 0;
handlers["Purchase Order Item"].qty(frm, row.doctype, row.name);
assert.equal(requests.length, 3, "an unfinished zero-quantity row must not request a pricing preview");
assert.equal(row.custom_chargeable_qty, 18, "clearing an estimate must preserve the actual quantity");
// A refresh after save must also invalidate a preview that was already in flight.
row.qty = 10;
handlers["Purchase Order Item"].qty(frm, row.doctype, row.name);
const beforeRefresh = writes;
handlers["Purchase Order"].refresh(frm);
reply(3, 20);
assert.equal(writes, beforeRefresh, "a pre-save preview must not write after the save refresh");
handlers["Purchase Order Item"].form_render(frm, row.doctype, row.name);
assert.equal(writes, beforeRefresh, "opening a saved row must not dirty the document");
assert.equal(requests.length, 4, "opening a row must not fetch a new preview");
console.log("Desk estimate checks passed");
