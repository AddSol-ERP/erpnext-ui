import { INSPECTION_TYPE_VALUES, REFERENCE_TYPES } from "./inspectionTypes";

/**
 * Read the Quality Inspection fields copied from a pending-inspection row.
 *
 * The report navigates to `/quality/inspection/new` with query parameters.
 * They are only INITIAL VALUES: every field stays editable, and `reference_*`
 * is still required by the doctype, so a bad or missing parameter must not
 * produce a document that cannot be saved in a way the user can see.
 *
 * `reference_type` and `inspection_type` are validated against the same value
 * lists the form posts. A query string is user-editable (HashRouter makes every
 * URL typeable), and an unknown Dynamic Link type would otherwise be sent to
 * the server as a reference to a doctype the QI form never offers.
 */
export function parseInspectionPrefill(params) {
	if (!params) return {};

	const read = (key) => {
		const value = params.get ? params.get(key) : params[key];
		return typeof value === "string" ? value.trim() : "";
	};

	const doc = {};
	const itemCode = read("item_code");
	const batchNo = read("batch_no");
	const serialNo = read("item_serial_no");
	const inspectionType = read("inspection_type");
	const referenceType = read("reference_type");
	const referenceName = read("reference_name");

	if (itemCode) doc.item_code = itemCode;
	if (batchNo) doc.batch_no = batchNo;
	if (serialNo) doc.item_serial_no = serialNo;
	if (INSPECTION_TYPE_VALUES.includes(inspectionType)) {
		doc.inspection_type = inspectionType;
	}

	// `reference_name` is a Dynamic Link whose target IS `reference_type`.
	// Storing a name without a valid type is the one combination ERPNext
	// reports as "Could not find Reference Name", naming the document rather
	// than the missing pairing -- so reject it here instead of pre-filling it.
	if (REFERENCE_TYPES.includes(referenceType) && referenceName) {
		doc.reference_type = referenceType;
		doc.reference_name = referenceName;
	}

	return doc;
}
