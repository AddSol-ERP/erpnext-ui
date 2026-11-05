import assert from "node:assert/strict";
import { storeWorkOrderFields } from "../erpnext_ui/frontend/src/config/storePurposes.js";
assert.deepEqual(storeWorkOrderFields("issue", "WO-001"), {custom_store_work_order: "WO-001"});
assert.deepEqual(storeWorkOrderFields("transferForManufacture", "WO-001"), {work_order: "WO-001"});
assert.deepEqual(storeWorkOrderFields("transfer", "WO-001"), {work_order: "WO-001"});
assert.equal(storeWorkOrderFields("issue", "").custom_store_work_order, undefined);
assert.throws(() => storeWorkOrderFields("invalid", "WO-001"));
console.log("Store Work Order payload checks passed");
