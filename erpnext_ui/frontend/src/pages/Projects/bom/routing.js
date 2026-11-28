// Copy business values only; Routing child identities must never reach a BOM.
const OPERATION_FIELDS = ["operation", "workstation", "workstation_type", "time_in_mins", "hour_rate", "description", "sequence_id", "batch_size", "set_cost_based_on_bom_qty", "cost_per_unit"];
const APPROVAL_FIELDS = ["approval_point", "perspective", "instruction", "instruction_snapshot", "approval_role", "note", "attachment_required"];
export const operationsEnabled = (doc) => Number(doc.with_operations) === 1;
export function routingOperations(routing) {
  return (routing.operations || []).map((row) => Object.fromEntries(
    OPERATION_FIELDS.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]),
  ));
}
export function routingApprovalRules(operations, defaultsByOperation) {
  return operations.flatMap((operation, index) => (defaultsByOperation[operation.operation] || []).map((rule) => ({
    ...Object.fromEntries(APPROVAL_FIELDS.filter((key) => rule[key] !== undefined).map((key) => [key, rule[key]])),
    operation: operation.operation,
    operation_row_index: index + 1,
  })));
}
export function operationFieldVisible(field, doc) {
  return !["routing", "operations", "transfer_material_against", "fg_based_operating_cost", "operating_cost_per_bom_quantity"].includes(field) || operationsEnabled(doc);
}
