export function inspectionFieldVisible(field, doc) {
  return field !== "quality_inspection_template" || Number(doc.quality_inspection_required) === 1;
}
