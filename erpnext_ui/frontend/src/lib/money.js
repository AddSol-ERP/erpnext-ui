/**
 * Currency display for document surfaces.
 *
 * WHY THIS EXISTS
 * ---------------
 * ERPNext stores amounts as raw floats (`12345.6`, `0`, `null`). Rendering them
 * straight into an approval screen produced `₹12345.6` next to `₹0` and `₹null`
 * -- three different shapes for one document, and no thousands separators, so a
 * six-figure quotation could not be read at a glance.
 *
 * The currency code is the ONLY thing the document carries: number format and
 * precision live in System Settings / the Currency doctype, which the approval
 * preview does not request. Two decimals with Latin-digit grouping is therefore
 * a deliberate fixed choice -- it is what a printed quotation shows, and it
 * keeps the figure identical in every UI language (an Arabic locale would
 * otherwise switch to Arabic-Indic digits mid-table).
 */

/** Currency code -> symbol. Anything not listed falls back to the code itself. */
const CURRENCY_SYMBOLS = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SAR: "﷼",
  QAR: "ر.ق",
  OMR: "ر.ع.",
  KWD: "د.ك",
  BHD: "د.ب",
  JOD: "د.أ",
  EGP: "E£",
  PKR: "₨",
  BDT: "৳",
  LKR: "Rs",
  NPR: "Rs",
  JPY: "¥",
  CNY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
};

export function currencySymbol(currency) {
  if (!currency) return "";
  return CURRENCY_SYMBOLS[String(currency).toUpperCase()] || String(currency);
}

const NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Missing amounts read as a dash, never as `0.00`. */
export function formatMoney(value, currency) {
  // Test the raw value first. `Number(null)` is `0` and `0` is finite, so a
  // `Number.isFinite(Number(value))` guard would render `₹0.00` for an amount
  // the server never sent -- which on an approval screen reads as "free".
  if (value === null || value === undefined || value === "") return "—";

  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  const symbol = currencySymbol(currency);
  // Keep the sign in front of the symbol: `-₹500.00` reads as a negative
  // amount, `₹-500.00` reads as a typo.
  return amount < 0
    ? `-${symbol}${NUMBER.format(Math.abs(amount))}`
    : `${symbol}${NUMBER.format(amount)}`;
}

/** Quantities: up to three decimals, no forced trailing zeros. */
export function formatQty(value) {
  if (value === null || value === undefined || value === "") return "—";

  const qty = Number(value);
  if (!Number.isFinite(qty)) return "—";

  return qty.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
