import assert from "node:assert/strict";
import { mergeWarehouseDefaults, resolvePlanningBomDraft } from "../src/pages/Production/projects/bomDraft.js";

const draft = { name: "BOM-1", docstatus: 0 };
const local = { name: "BOM-1", initialState: { planningQuantity: 5 } };
assert.deepEqual(resolvePlanningBomDraft("BOM-1", null, [draft]), { name: "BOM-1", initialState: null });
assert.equal(resolvePlanningBomDraft("BOM-1", local, [draft]), local);
assert.equal(resolvePlanningBomDraft("BOM-OTHER", local, [draft]), null);
assert.equal(resolvePlanningBomDraft("BOM-1", local, [{ ...draft, docstatus: 1 }]), null);
assert.equal(resolvePlanningBomDraft(null, local, []), local);
assert.deepEqual(mergeWarehouseDefaults({ source: "Chosen", wip: "", fg: "" }, { source: "Default", wip: "WIP", fg: "FG" }), { source: "Chosen", wip: "WIP", fg: "FG" });
assert.deepEqual(mergeWarehouseDefaults({ source: "", wip: "", fg: "" }), { source: "", wip: "", fg: "" });
console.log("Project draft BOM resolution passed");
