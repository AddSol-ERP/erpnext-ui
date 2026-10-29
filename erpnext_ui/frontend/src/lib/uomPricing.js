/**
 * UOM based purchase/sales pricing helpers (frontend mirror of
 * `erpnext_ui/uom_pricing.py`).
 *
 * Pure functions so the rules suite can assert them without mounting a form.
 * The authoritative behaviour lives server side; these helpers only shape the
 * labels and derived figures the purchase/sales screens render from the effective
 * pricing rule returned by the authenticated metadata endpoints.
 */

/**
 * Dynamic rate-per-UOM label, e.g. "Rate per kg" or "Rate per metre".
 *
 * The selected pricing UOM is data (a Link to the UOM doctype), so the label is
 * derived from it rather than hardcoded -- the same rule the server side applies
 * (`erpnext_ui/uom_pricing.py`).
 *
 * @param {string} pricingUom
 * @returns {string} label, or "" when no pricing UOM is resolved.
 */
export function ratePerUomLabel(pricingUom) {
  const uom = String(pricingUom || "").trim();
  if (!uom) return "";
  return `Rate per ${uom}`;
}

/**
 * Whether the effective rule picks the formula mode over direct entry.
 *
 * @param {Object} rule resolved pricing rule ({ formula_mode, ... })
 * @returns {boolean}
 */
export function isFormulaMode(rule) {
  return String(rule?.formula_mode || "") === "Formula";
}

/**
 * Symbols of the parameters the effective rule marks required.
 *
 * The UI renders only the parameters the rule requires; an unconfigured rule
 * renders none, and a missing required parameter must not read as zero.
 *
 * @param {Object} rule resolved pricing rule ({ params: [{ symbol, required }] })
 * @returns {string[]}
 */
export function requiredParamSymbols(rule) {
  const params = Array.isArray(rule?.params) ? rule.params : [];
  return params.filter((p) => p && p.required).map((p) => p.symbol);
}

/**
 * Line amount from the chargeable quantity and the rate per pricing UOM.
 *
 * Mirrors the server side `calculate_line_amount`: amount = chargeable qty * rate
 * per UOM, and ERPNext's standard line rate is then derived as amount / document
 * qty so its own amount/base-net/tax/total math stays authoritative.
 *
 * @param {number|string} chargeableQty
 * @param {number|string} ratePerUom
 * @returns {number}
 */
export function lineAmount(chargeableQty, ratePerUom) {
  const qty = Number(chargeableQty);
  const rate = Number(ratePerUom);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) {
    return 0;
  }
  return qty * rate;
}
