/**
 * Per-report page chrome plus each report's grouping contract.
 *
 * The report NAME and its owning app stay server-side: a caller who can edit
 * this bundle must not be able to point the key at a different report. Only
 * the i18n KEYS live here, and the server resolves the key against
 * `SPA_CUSTOM_REPORTS` in erpnext_ui/api.py on every call.
 *
 * `groupBy`/`sum`/`ratio`/`constant`/`mixed` declare how the report's own
 * columns behave once its flat rows are grouped.
 *
 * Why this is a module of its own rather than a const inside the page: the
 * grouping contract is where a wrong number reaches a storekeeper, and the
 * rules suite asserts it against REAL rows (`.smoke-tmp/rules.jsx`). A
 * contract that can only be read out of a React file is a contract nothing
 * checks.
 */

/**
 * `Plate Stock Register`: the report returns one row per (item, warehouse,
 * batch) and sorts by that same triple, so grouping by `item` needs no
 * client-side sort -- and grouping children by `warehouse, batch` means heat
 * number (which is read off the Batch record, so it is 1:1 with a batch) lands
 * on the child row where it belongs.
 */
const PLATE_STOCK_REGISTER = {
  titleKey: "reports.plateStockRegister",
  subtitleKey: "reports.plateStockRegisterDesc",
  // Filters shown inline; everything else folds into the FilterBar popover.
  // Item, warehouse and grade are what a storekeeper reaches for to answer
  // "how much of this plate do we hold, and where" -- batch, heat number and
  // thickness are traceability lookups. Declared here rather than hardcoded in
  // the bar so the bar stays generic.
  primaryFilters: ["item", "warehouse", "grade"],
  grouping: {
    groupBy: ["item"],
    childKey: ["warehouse", "batch"],
    sum: ["plates", "total_weight", "stock_value"],
    // Recomputed on the parent as numerator/denominator -- never added. See
    // group.js for why summing a per-batch average is silently wrong.
    ratio: {
      weight_per_plate: ["total_weight", "plates"],
      value_per_kg: ["stock_value", "total_weight"],
    },
    // Item-master attributes: identical on every child, so shown once.
    constant: ["thickness", "length", "width"],
    // `grade` is `batch.custom_grade or item.item_group`, so it can disagree
    // between two batches of the same item. Shown when unanimous, "Mixed"
    // when not -- never the first child's value.
    mixed: ["grade"],
    countFields: [
      { field: "batch", labelKey: "reports.batchCount" },
      { field: "warehouse", labelKey: "reports.warehouseCount" },
    ],
  },
};

/**
 * `Plate Offcut Register`: the offcut pieces, which are stock of their own.
 *
 * The report returns one row per (item, warehouse, SOURCE batch) -- the batch
 * the piece was cut from, because every piece gets a batch of its own and
 * grouping by that would give one row per piece.
 */
const PLATE_OFFCUT_REGISTER = {
  titleKey: "reports.plateOffcutRegister",
  subtitleKey: "reports.plateOffcutRegisterDesc",
  // Item, warehouse and grade inline; heat number, source batch and
  // thickness are traceability lookups. Same split as the plate register,
  // because the two answer the same kind of question about different stock.
  primaryFilters: ["item", "warehouse", "grade"],
  grouping: {
    groupBy: ["item"],
    childKey: ["warehouse", "batch"],
    sum: ["pieces", "total_weight", "total_value"],
    // Recomputed on the parent as numerator/denominator -- never added. See
    // group.js for why summing a per-batch average is silently wrong.
    ratio: {
      weight_per_piece: ["total_weight", "pieces"],
      value_per_kg: ["total_value", "total_weight"],
    },
    // Item-master attributes: identical on every child, so shown once. The
    // size is in the Item's own name, and the dimension that does not apply
    // to the shape (a circle has no length, a rectangle no diameter) comes
    // back as None and renders as an em dash rather than a real zero.
    constant: [
      "thickness",
      "length_mm",
      "width_mm",
      "diameter_mm",
      "source_item",
    ],
    // `grade` is the Batch's own grade label or the Item's group, so it can
    // disagree between two batches of the same item. `heat_number` is the
    // source plate's, and two pieces of one size can come from two heats --
    // shown when unanimous, "Mixed" when not.
    mixed: ["grade", "heat_number"],
    countFields: [
      { field: "batch", labelKey: "reports.batchCount" },
      { field: "warehouse", labelKey: "reports.warehouseCount" },
    ],
  },
};

/**
 * `Plate Receipt Weight Variance`: one parent per Purchase Receipt, its lines
 * beneath. A receipt is the transaction, so its weights and amount total
 * meaningfully.
 */
const PLATE_RECEIPT_WEIGHT_VARIANCE = {
  titleKey: "reports.plateWeightVariance",
  subtitleKey: "reports.plateWeightVarianceDesc",
  // A date range is the question this report answers ("what came in short
  // weight over the last 30 days"), so both dates and the tolerance switch sit
  // inline; supplier and item group are the narrower lookups.
  primaryFilters: [
    "from_date",
    "to_date",
    "supplier",
    "above_tolerance_only",
  ],
  grouping: {
    groupBy: ["receipt"],
    childKey: ["item"],
    sum: ["plates", "estimated_kg", "supplier_kg", "accepted_kg", "amount"],
    // `variance_pct` is deliberately absent from both sum and ratio. It is a
    // per-row percentage, and the correct aggregate is
    // (Σsupplier_kg - Σestimated_kg) / Σestimated_kg -- a SUBTRACTIVE ratio,
    // which group.js's {col: [num, den]} cannot express. Summing the rows'
    // percentages would be meaningless, so the parent shows no percentage at
    // all rather than a wrong one. `decision` and `above_tolerance` are
    // per-row flags for the same reason.
    countFields: [{ field: "item", labelKey: "reports.itemCount" }],
  },
};

export const REPORT_PAGES = {
  "plate-stock-register": PLATE_STOCK_REGISTER,
  "plate-offcut-register": PLATE_OFFCUT_REGISTER,
  "plate-receipt-weight-variance": PLATE_RECEIPT_WEIGHT_VARIANCE,
};

export default REPORT_PAGES;
