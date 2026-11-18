import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sandbox = {};
vm.runInNewContext(readFileSync(new URL("../erpnext_ui/public/supplier_quotation/pricing-preview.js", import.meta.url), "utf8"), sandbox);
const calculate = sandbox.SupplierQuotationPricing.calculate;
const plate = { qty: 10, uom: "Nos", pricing: { enabled: true, pricing_uom: "Kg", calculated_chargeable_qty: 20 } };
let result = calculate(plate, { custom_rate_per_pricing_uom: 80 });
assert.equal(result.amount, 1600);
assert.equal(result.standardRate, 160);
assert.equal(result.chargeableQty, 20);
assert.equal(calculate(plate, { custom_rate_per_pricing_uom: 80, custom_chargeable_qty: 19 }).amount, 1520);
assert.equal(calculate(plate, { custom_rate_per_pricing_uom: 80, custom_chargeable_qty: 0 }).amount, 1600);
assert.equal(calculate({ ...plate, pricing: { ...plate.pricing, chargeable_qty: 18 } }, { custom_rate_per_pricing_uom: 80 }).amount, 1440);
const liquid = { qty: 2, uom: "Drum", pricing: { enabled: true, pricing_uom: "Ltr", calculated_chargeable_qty: 400 } };
assert.equal(calculate(liquid, { custom_rate_per_pricing_uom: 10 }).standardRate, 2000);
const direct = { ...plate, pricing: { enabled: true, pricing_uom: "Kg", calculated_chargeable_qty: null } };
assert.equal(calculate(direct, { custom_rate_per_pricing_uom: 10 }).pending, true);
assert.equal(calculate(direct, { custom_rate_per_pricing_uom: 10, custom_chargeable_qty: 5 }).amount, 50);
for (const value of [undefined, "", 0, -1, "bad", Infinity]) {
  assert.equal(calculate(plate, { custom_rate_per_pricing_uom: value }).pending, true);
}
assert.equal(calculate({ qty: 3, uom: "Nos" }, { rate: 50 }).amount, 150);
assert.equal(calculate({ ...plate, qty: 0 }, { custom_rate_per_pricing_uom: 80 }).pending, true);
assert.equal(calculate({ ...plate, pricing: { error: "Unavailable" } }, {}).error, "Unavailable");
console.log("Supplier pricing preview checks passed");
