//#region src/pages/Projects/bom/routing.js
var OPERATION_FIELDS = [
	"operation",
	"workstation",
	"workstation_type",
	"time_in_mins",
	"hour_rate",
	"description",
	"sequence_id",
	"batch_size",
	"set_cost_based_on_bom_qty",
	"cost_per_unit"
];
var operationsEnabled = (doc) => Number(doc.with_operations) === 1;
function routingOperations(routing) {
	return (routing.operations || []).map((row) => Object.fromEntries(OPERATION_FIELDS.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
}
function operationFieldVisible(field, doc) {
	return ![
		"routing",
		"operations",
		"transfer_material_against",
		"fg_based_operating_cost",
		"operating_cost_per_bom_quantity"
	].includes(field) || operationsEnabled(doc);
}
//#endregion
export { operationFieldVisible, routingOperations };
