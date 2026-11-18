/* Display-only arithmetic. Submission always recalculates through ERPNext. */
(function (root) {
  "use strict";
  function calculate(item, values) {
    const pricing = item.pricing || {};
    const quantity = Number(item.qty);
    const result = { pending: true, standardRate: null, amount: null, chargeableQty: null };
    if (pricing.error) return { ...result, error: pricing.error };
    if (!Number.isFinite(quantity) || quantity <= 0) return result;
    const rawRate = pricing.enabled ? values.custom_rate_per_pricing_uom : values.rate;
    if (rawRate == null || String(rawRate).trim() === "") return result;
    const rate = Number(rawRate);
    if (!Number.isFinite(rate) || rate <= 0) return result;
    let chargeableQty = quantity;
    if (pricing.enabled) {
      const entered = Object.prototype.hasOwnProperty.call(values, "custom_chargeable_qty")
        ? values.custom_chargeable_qty : pricing.chargeable_qty;
      chargeableQty = entered != null && String(entered).trim() !== "" && Number(entered) !== 0
        ? Number(entered) : Number(pricing.calculated_chargeable_qty);
      if (!Number.isFinite(chargeableQty) || chargeableQty <= 0) {
        return { ...result, error: `Enter chargeable quantity in ${pricing.pricing_uom || "the pricing UOM"}.` };
      }
    }
    const amount = rate * chargeableQty;
    if (!Number.isFinite(amount)) return result;
    return { pending: false, standardRate: amount / quantity, amount, chargeableQty };
  }
  root.SupplierQuotationPricing = { calculate };
})(globalThis);
