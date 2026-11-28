import assert from "node:assert/strict";
import { routingOperations, routingApprovalRules } from "../src/pages/Projects/bom/routing.js";

const operations = routingOperations({ operations: [
  { name: "SOURCE-1", operation: "Cut", time_in_mins: 15 },
  { name: "SOURCE-2", operation: "Cut", time_in_mins: 20 },
  { operation: "Weld", time_in_mins: 10 },
] });
const rules = routingApprovalRules(operations, { Cut: [
  { name: "MASTER-RULE", instruction: "Inspect", approval_point: "Before Start", attachment_required: 1 },
] });
assert.deepEqual(rules.map((rule) => rule.operation_row_index), [1, 2]);
assert.ok(rules.every((rule) => rule.instruction === "Inspect" && rule.attachment_required === 1 && !rule.name));
assert.deepEqual(routingApprovalRules(operations, {}), []);
console.log("Routing operation approval checks passed");
