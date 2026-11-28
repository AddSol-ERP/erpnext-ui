import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let handler;
const changed = [];
let refreshed = "";
const frappe = { ui: { form: { on: (doctype, actions) => { assert.equal(doctype, "Routing"); handler = actions.refresh; } } },
  meta: { has_field: (_doctype, field) => field !== "custom_approval_reason" } };
vm.runInNewContext(readFileSync(new URL("../../public/js/routing_approval_fields.js", import.meta.url), "utf8"), { frappe });
handler({ fields_dict: { operations: { grid: { update_docfield_property: (...args) => changed.push(args) } } }, refresh_field: (field) => { refreshed = field; } });
assert.deepEqual(changed, [["custom_approval_stage", "hidden", 1], ["custom_approval_role", "hidden", 1]]);
assert.equal(refreshed, "operations");
console.log("Routing legacy approval fields hidden");
