import assert from "node:assert/strict";
import { buildLayoutTree, sectionsAsTabs, findGroupIndexForField } from "../src/components/GenericForm/buildLayout";

const fields = [
  { fieldname: "first", fieldtype: "Data" },
  { fieldtype: "Section Break", label: "Accounting" },
  { fieldname: "account", fieldtype: "Link" },
  { fieldtype: "Section Break" },
  { fieldname: "tax", fieldtype: "Data" },
  { fieldtype: "Section Break", label: "Addresses" },
  { fieldname: "address", fieldtype: "Data" },
  { fieldname: "hidden", fieldtype: "Data", hidden: 1 },
];
const tabs = sectionsAsTabs(buildLayoutTree(fields));
assert.equal(tabs.length, 3);
assert.equal(tabs[1].label, "Accounting");
assert.deepEqual(tabs[1].sections.flatMap((section) => section.fields.map((field) => field.fieldname)), ["account", "tax"]);
assert.equal(findGroupIndexForField(tabs, "address"), 2);
assert.deepEqual(tabs.flatMap((tab) => tab.sections.flatMap((section) => section.fields.map((field) => field.fieldname))), ["first", "account", "tax", "address"]);
console.log("Form section tabs preserve field grouping and validation targets");
