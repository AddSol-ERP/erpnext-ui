/**
 * ERPNext's `Quality Inspection.inspection_type` options.
 *
 * THESE ARE VALUES, NOT LABELS. They are stored on the document, posted back
 * on save, and used as an equality filter -- so they are ERPNext's own
 * strings, copied character for character from `quality_inspection.json`:
 *
 *   "options": "\nIncoming\nOutgoing\nIn Process"
 *
 * A stray character (a missing space, a dash instead of one) is a filter that
 * matches NOTHING, and the list comes back empty with no explanation --
 * which reads as "no inspections of this type exist" rather than "the filter
 * is wrong".
 *
 * One module, because four places need them: the inspection form's select,
 * the list's row label, the list's filter, and the hub's tiles. They were
 * being written out separately, and a fix to one would not reach the others.
 */
export const INSPECTION_TYPES = [
  { value: "Incoming", labelKey: "quality.typeIncoming" },
  { value: "Outgoing", labelKey: "quality.typeOutgoing" },
  { value: "In Process", labelKey: "quality.typeInProcess" },
];

/** The ERPNext values, in order -- for a Select's options. */
export const INSPECTION_TYPE_VALUES = INSPECTION_TYPES.map((t) => t.value);

/**
 * ERPNext's `Quality Inspection.reference_type` options, character for
 * character from `quality_inspection.json`.
 *
 * These are VALUES stored on the document and posted back on save, so a
 * stray character is a link/filter that matches nothing.
 */
export const REFERENCE_TYPES = [
  "Purchase Receipt",
  "Purchase Invoice",
  "Subcontracting Receipt",
  "Delivery Note",
  "Sales Invoice",
  "Stock Entry",
  "Job Card",
];

/**
 * The reference types that belong to each inspection type.
 *
 * A QUALITY CONVENTION, not an ERPNext rule. `reference_type` and
 * `inspection_type` are two independent Selects and ERPNext enforces no
 * relationship between them -- but the three inspection types are three
 * different jobs, and each is raised against the documents that job happens
 * to:
 *
 *   Incoming   -- material arriving
 *   Outgoing   -- goods leaving
 *   In Process -- work being made
 *
 * ERPNext's own validator agrees about the one pair that is not a choice:
 * `if self.inspection_type == "In Process" and self.reference_type ==
 * "Job Card"` (quality_inspection.py:67) is the only place in the codebase
 * that couples the two fields.
 *
 * Offering a filtered list of them is what makes the type-scoped list
 * usable: an "Incoming" list whose reference filter offers "Delivery Note"
 * is a filter that can only ever come back empty.
 */
export const REFERENCE_TYPES_BY_INSPECTION_TYPE = {
  Incoming: ["Purchase Receipt", "Purchase Invoice", "Subcontracting Receipt"],
  Outgoing: ["Delivery Note", "Sales Invoice", "Stock Entry"],
  "In Process": ["Job Card"],
};

/**
 * The reference types to offer for an inspection type.
 *
 * An unknown or absent type gets ALL of them: a filter that silently
 * offered a subset would hide inspections the user can plainly see in the
 * list.
 */
export function referenceTypesFor(inspectionType) {
  return REFERENCE_TYPES_BY_INSPECTION_TYPE[inspectionType] || REFERENCE_TYPES;
}

/**
 * The translated label for an inspection type.
 *
 * An unknown type falls through to the value itself: it is still the truth
 * about what is stored, and hiding it would make the row look empty.
 */
export function inspectionTypeLabel(type, t) {
  const found = INSPECTION_TYPES.find((it) => it.value === type);
  return found ? t(found.labelKey) : type || "";
}
