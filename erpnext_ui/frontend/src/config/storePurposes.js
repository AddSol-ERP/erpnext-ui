/**
 * Store module vocabulary — the ONE place that maps what a person wants to do
 * onto what ERPNext stores.
 *
 * Why this file exists
 * --------------------
 * The Store UI used to name things in ERPNext's vocabulary ("Material Request",
 * "Type", "Stock Entry", "Entry Type") and each page hardcoded its own doctype
 * strings. That produced three concrete failures:
 *
 *   1. The Material Request hub offered `material_request_type: "Transfer"` and
 *      `"Material Receipt"`. Neither is a valid ERPNext v15 option, so
 *      Frappe's `_validate_selects` rejected every save with HTTP 417.
 *   2. The same concept was called "Material Transfer" on one screen and
 *      "Transfer" on another, because the raw enum and the display label were
 *      kept in two parallel i18n namespaces (`store.types.*` and
 *      `store.entryTypes.*`) that had drifted apart.
 *   3. "Material Issue"/"Material Transfer"/"Material Receipt" are used as the
 *      name for BOTH a Material Request type and a Stock Entry purpose. They
 *      read as the same thing but are opposite directions on different
 *      documents — which is precisely why people could not tell which one to
 *      pick.
 *
 * The rule this file enforces: a person picks a *purpose*, never a doctype.
 * Everything downstream reads its doctype and field value from here.
 *
 * Nothing in this file may import React, i18n or the api layer. It is pure data
 * so it can be asserted against in `.smoke-tmp/rules.jsx` without a DOM.
 */

// ============================================================================
// Material Request purposes
// ============================================================================
// These are the EXACT options of the `material_request_type` Select on
// `Material Request` in ERPNext v15. Do not add a value that is not in that
// list -- it will be rejected server-side by frappe/model/base_document.py
// `_validate_selects`, with a generic 417 and no field name.
export const MATERIAL_REQUEST_TYPES = [
  "Purchase",
  "Material Transfer",
  "Material Issue",
  "Manufacture",
  "Customer Provided",
];

/**
 * User-facing purposes that create a Material Request.
 *
 * `i18nKey` resolves under the `store.purposes.*` namespace.
 */
export const REQUEST_PURPOSES = {
  // "Indent" is what the shop floor actually calls this: asking the store for
  // material you need to do a job. Behind it is a Material Request of type
  // Material Issue, which is what the store later fulfils with a Stock Entry.
  indent: {
    i18nKey: "indent",
    doctype: "Material Request",
    materialRequestType: "Material Issue",
    // Material Issue MRs are the ones a store manager can actually act on.
    // ERPNext's own make_stock_entry() refuses any other type here
    // (material_request.py:816-822), so this flag is the client's mirror of
    // that server-side gate -- not an independent opinion.
    fulfillableByStore: true,
    icon: "ClipboardList",
  },
  purchase: {
    i18nKey: "purchase",
    doctype: "Material Request",
    materialRequestType: "Purchase",
    // Purchase MRs are routed through Request for Quotation -> Purchase Order
    // -> Purchase Receipt. They never become a Stock Entry from the store, so
    // they must not appear in the storekeeper's "Give Items" queue.
    fulfillableByStore: false,
    icon: "ShoppingCart",
  },
  transfer: {
    i18nKey: "transfer",
    doctype: "Material Request",
    materialRequestType: "Material Transfer",
    fulfillableByStore: true,
    icon: "ArrowLeftRight",
  },
  production: {
    i18nKey: "production",
    doctype: "Material Request",
    materialRequestType: "Manufacture",
    fulfillableByStore: false,
    icon: "Factory",
  },
  customerProvided: {
    i18nKey: "customerProvided",
    doctype: "Material Request",
    materialRequestType: "Customer Provided",
    fulfillableByStore: true,
    icon: "UserCheck",
  },
};

/** Purpose keys, in the order a new user should see them. */
export const REQUEST_PURPOSE_KEYS = [
  "indent",
  "purchase",
  "transfer",
  "production",
  "customerProvided",
];

// ============================================================================
// Stock Entry purposes
// ============================================================================
// `stock_entry_type` on a Stock Entry is a LINK to the `Stock Entry Type`
// doctype, not a Select -- the nine standard records simply happen to be named
// exactly like their purpose. `purpose` is hidden and read-only on the Stock
// Entry and is derived from `stock_entry_type.purpose` via `fetch_from`, so
// sending `purpose` ourselves is pointless: server-side
// `set_fetch_from_value` unconditionally overwrites it
// (frappe/model/base_document.py:869-890).
//
// So: we send `stock_entry_type`, and `purpose` below is only ever used to
// decide which fields the form should show.
export const STOCK_ENTRY_PURPOSES = {
  issue: {
    i18nKey: "issue",
    stockEntryType: "Material Issue",
    purpose: "Material Issue",
    group: "everyday",
    // `validate_warehouse` (stock_entry.py:829-900) force-clears to_warehouse for
    // source-only purposes and from_warehouse for target-only purposes. Hiding
    // the field is the user-facing half of that rule: we are not merely
    // ignoring the value, we are not asking for it.
    showFromWarehouse: true,
    showToWarehouse: false,
    requiresWorkOrder: false,
  },
  receipt: {
    i18nKey: "receipt",
    stockEntryType: "Material Receipt",
    purpose: "Material Receipt",
    group: "everyday",
    showFromWarehouse: false,
    showToWarehouse: true,
    requiresWorkOrder: false,
  },
  transfer: {
    i18nKey: "transfer",
    stockEntryType: "Material Transfer",
    purpose: "Material Transfer",
    group: "everyday",
    showFromWarehouse: true,
    showToWarehouse: true,
    requiresWorkOrder: false,
  },
  transferForManufacture: {
    i18nKey: "transferForManufacture",
    stockEntryType: "Material Transfer for Manufacture",
    purpose: "Material Transfer for Manufacture",
    group: "manufacturing",
    showFromWarehouse: true,
    showToWarehouse: true,
    // stock_entry.py:903-905 requires a Work Order for both manufacturing moves.
    requiresWorkOrder: true,
  },
  consumption: {
    i18nKey: "consumption",
    stockEntryType: "Material Consumption for Manufacture",
    purpose: "Material Consumption for Manufacture",
    group: "manufacturing",
    showFromWarehouse: true,
    showToWarehouse: false,
    requiresWorkOrder: true,
  },
  manufacture: {
    i18nKey: "manufacture",
    stockEntryType: "Manufacture",
    purpose: "Manufacture",
    group: "manufacturing",
    // Both sides are needed, but per ROW: raw materials come FROM the store and
    // finished goods go TO the finished-goods warehouse. The old single
    // From/To pair wrote both warehouses on every row, which is wrong here.
    showFromWarehouse: true,
    showToWarehouse: true,
    perRowWarehouses: true,
    requiresWorkOrder: true,
  },
  repack: {
    i18nKey: "repack",
    stockEntryType: "Repack",
    purpose: "Repack",
    group: "correction",
    showFromWarehouse: true,
    showToWarehouse: true,
    perRowWarehouses: true,
    requiresWorkOrder: false,
  },
  disassemble: {
    i18nKey: "disassemble",
    stockEntryType: "Disassemble",
    purpose: "Disassemble",
    group: "correction",
    showFromWarehouse: true,
    showToWarehouse: true,
    perRowWarehouses: true,
    requiresWorkOrder: true,
  },
  subcontractor: {
    i18nKey: "subcontractor",
    stockEntryType: "Send to Subcontractor",
    purpose: "Send to Subcontractor",
    group: "correction",
    showFromWarehouse: true,
    showToWarehouse: true,
    requiresWorkOrder: false,
  },
};

/** Display groups for the Stock Movements page, in order. */
export const STOCK_MOVEMENT_GROUPS = ["everyday", "manufacturing", "correction"];

/**
 * Build a `resource/Stock Entry` payload from a purpose's config.
 *
 * `items` rows must already carry s_warehouse/t_warehouse where the purpose
 * needs them per row -- the header from/to are only a backstop. ERPNext's
 * `validate_warehouse` only copies the header down when a row has neither side
 * set (stock_entry.py:855-858), so a row that set one side keeps it.
 *
 * `purpose` is deliberately NOT emitted: it is hidden, read-only, and derived.
 */
export function buildStockEntryPayload(purposeKey, { items, fromWarehouse, toWarehouse, ...rest }) {
  const cfg = STOCK_ENTRY_PURPOSES[purposeKey];
  if (!cfg) throw new Error(`Unknown stock movement purpose: ${purposeKey}`);

  const payload = {
    doctype: "Stock Entry",
    stock_entry_type: cfg.stockEntryType,
    items: items.map((row) => ({ ...row })),
    ...rest,
  };

  // Only send the warehouse the purpose actually uses. Sending the other one is
  // harmless (the server clears it) but it round-trips through the user's form
  // state and shows up in `dirty` comparisons for no reason.
  if (cfg.showFromWarehouse && fromWarehouse) payload.from_warehouse = fromWarehouse;
  if (cfg.showToWarehouse && toWarehouse) payload.to_warehouse = toWarehouse;

  return payload;
}

/** Look up a Material Request purpose by its ERPNext `material_request_type`. */
/**
 * Reverse lookup: ERPNext Stock Entry type string -> its purpose key.
 *
 * The UI stores the raw type (that is what `stock_entry_type` links to), but
 * every rule about that type is expressed on the key. One function here means a
 * tenth purpose is added in exactly one place; the alternative is the
 * `if (type === "Material Issue")` chain this replaced, which fell through to
 * a both-warehouses default for anything it did not list.
 */
export function stockPurposeForType(stockEntryType) {
  const key = Object.keys(STOCK_ENTRY_PURPOSES).find(
    (k) => STOCK_ENTRY_PURPOSES[k].stockEntryType === stockEntryType,
  );
  return key || "";
}

export function requestPurposeForType(materialRequestType) {
  return (
    Object.entries(REQUEST_PURPOSES).find(
      ([, cfg]) => cfg.materialRequestType === materialRequestType,
    )?.[0] || null
  );
}

/**
 * Resolve a purpose key taken from a URL segment.
 *
 * Returns null for an unknown key rather than throwing, so a stale bookmark
 * renders an empty state instead of a blank screen. Every route that reads
 * `:purpose` must go through this — reading `REQUEST_PURPOSES[key]` directly
 * would pass `undefined` straight into `materialRequestType` and produce a
 * request ERPNext rejects with a bare 417.
 */
export function requestPurpose(key) {
  return REQUEST_PURPOSES[key] || null;
}

/**
 * Material Request types the store keeper is able to fulfil.
 *
 * Mirrors ERPNext's own gate in `make_stock_entry`
 * (material_request.py:816-822), which only accepts Material Transfer, Material
 * Issue and Customer Provided. If this list ever drifts from that, the symptom
 * is a mapped Stock Entry that fails to save -- so it is asserted in
 * `.smoke-tmp/rules.jsx`.
 */
export const STORE_FULFILLABLE_TYPES = MATERIAL_REQUEST_TYPES.filter((type) =>
  REQUEST_PURPOSES[requestPurposeForType(type)]?.fulfillableByStore,
);