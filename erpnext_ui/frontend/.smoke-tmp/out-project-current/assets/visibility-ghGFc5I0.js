//#region src/pages/Projects/bom/visibility.js
function inspectionFieldVisible(field, doc) {
	return field !== "quality_inspection_template" || Number(doc.quality_inspection_required) === 1;
}
//#endregion
export { inspectionFieldVisible };
