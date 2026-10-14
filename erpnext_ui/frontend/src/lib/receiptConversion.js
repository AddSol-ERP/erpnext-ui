/**
 * Purchase Receipt line arithmetic.
 *
 * Everything here is pure so it can be asserted directly in the rules suite
 * without mounting a form. The behaviour is not ours to choose, though -- it is
 * forced by ERPNext, and the four rules below are the whole reason this module
 * exists. All citations are v15 source.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FACTOR IS COMPUTED AND NEVER FETCHED
 * ---------------------------------------------------------------------------
 * `conversion_factor` converts transaction-UOM -> stock-UOM, so
 * `stock_qty = qty * conversion_factor` (buying_controller.py:517). For a
 * weighed receipt the honest factor is a *measurement*, not a master-data
 * constant: 10 plates that came in at 25.4 Kg are 2.54 Kg each, and the next
 * delivery will not weigh the same. Reading it from UOM Conversion Detail
 * (which is what `get_conversion_factor` does) books the nominal figure and
 * silently mis-states stock on every weighed receipt.
 *
 * So: the factor is always `total / qty`, computed as the user types, and it is
 * never offered as an input. Four rules make that legal:
 *
 *   1. `uom` is compared against the PO line
 *      (purchase_receipt.py:315) -- so on a PO receipt the received UOM is
 *      pinned, but it is NOT compared to anything else.
 *   2. `conversion_factor` is not in `compare_fields` at all, so it is never
 *      compared to the PO (transaction_base.py:125-127 iterates compare_fields
 *      only). Note this is true for every case, not just is_return.
 *   3. `stock_qty` must be a whole number when the STOCK UOM is flagged
 *      `must_be_whole_number` (purchase_receipt.py:278 --
 *      `validate_uom_is_integer("stock_uom", "stock_qty")`). Note this checks
 *      stock_qty against the STOCK uom, which is a different pair from the
 *      transaction qty against the transaction uom.
 *   4. If `uom == stock_uom`, ERPNext force-resets the factor to 1.0
 *      (stock_controller.py:110-116). This is exactly why a total is only
 *      offered when the two differ -- otherwise it could never be used.
 *
 * A client-supplied non-zero factor is respected: `set_missing_values` only
 * fills it when it is zero (buying_controller.py:362), and it is excluded from
 * float rounding (:361), so 2.54 stays 2.54.
 *
 * Side benefit worth knowing: valuation needs no extra work.
 * `stock_uom_rate = rate / conversion_factor` (stock_controller.py:1225), so a
 * rate of 500/Nos at factor 2.54 becomes 196.85/Kg and 25.4 Kg values back to
 * the same total.
 */

/**
 * Conversion factor from a measured total. Returns null when it cannot be
 * derived -- deliberately not 1, because a silent 1 would book qty instead of
 * the measured weight and look like a successful save.
 *
 * @param {number|string} qty     quantity in the received (transaction) UOM
 * @param {number|string} total   measured total in the stock UOM
 * @returns {number|null}
 */
export function computeFactor(qty, total) {
  // Guard the RAW value, not the coerced number: `Number("")` and
  // `Number("  ")` are both 0, which passes an isFinite check and would yield
  // a factor of 0 -- i.e. stock_qty 0, a silently wrong number that looks like
  // a real result. An absent measurement must be null, not zero.
  if (total === "" || total === null || total === undefined) return null;
  if (typeof total === "string" && total.trim() === "") return null;

  const q = Number(qty);
  const t = Number(total);
  if (!Number.isFinite(q) || q === 0 || !Number.isFinite(t)) return null;
  return t / q;
}

/**
 * Whether this line needs a measured total at all.
 *
 * Two conditions, both necessary:
 *
 * 1. The received UOM must differ from the stock UOM. That is exactly when a
 *    factor other than 1 survives ERPNext's force-reset (rule 4 above); when
 *    they match, asking for a total would be theatre.
 * 2. The STOCK UOM must not be flagged `must_be_whole_number`.
 *
 * The second one is a correctness guard, not a nicety, and it was found by
 * checking against live data. Take W-0268-01-001: stock_uom `Nos`, also
 * `Kg`. Set the received UOM to `Kg` and condition 1 alone would offer a
 * "Total received (Nos)" field -- and a user entering 10 Kg against a total of
 * 25 gets factor 2.5, so ERPNext books **25 Nos of stock from a 10 Kg
 * delivery**. It saves cleanly and the quantity is silently wrong.
 *
 * A weight simply cannot be stock when the stock UOM counts whole pieces, so
 * there is no coherent meaning for the field on such an item and it is not
 * offered. Weighed items must be stocked in a weight UOM -- which is item-master
 * configuration, and out of scope for this screen to change.
 */
export function needsMeasuredTotal(info, receivedUom) {
  if (!info || !info.stock_uom || !receivedUom) return false;
  if (info.stock_uom === receivedUom) return false;

  const stockUomRow = (info.uoms || []).find((u) => u.uom === info.stock_uom);
  return !(stockUomRow && stockUomRow.must_be_whole_number);
}

/**
 * The two whole-number rules ERPNext will enforce, which are NOT the same check:
 *
 *   - `mustWholeQty`   -- transaction qty against the RECEIVED uom
 *                         (a half-plate is not a plate)
 *   - `mustWholeStock` -- stock_qty against the STOCK uom
 *                         (purchase_receipt.py:278)
 *
 * `info` is the get_item_uom_options payload: { stock_uom, uoms: [...] }.
 */
export function wholeNumberRules(info, receivedUom) {
  const uoms = (info && info.uoms) || [];
  const find = (uom) => uoms.find((x) => x.uom === uom);
  return {
    mustWholeQty: Boolean(find(receivedUom)?.must_be_whole_number),
    mustWholeStock: Boolean(find(info?.stock_uom)?.must_be_whole_number),
  };
}

/**
 * Apply a measured total to a row, returning the fields ERPNext will use.
 *
 * `stock_qty` is set to the measured total directly rather than to
 * `qty * factor`: the multiplication is algebraically identical but reintroduces
 * float noise (25.4/10*10 === 25.400000000000002), and this value is what the
 * user reads back on screen. ERPNext re-derives it server-side regardless.
 *
 * When the factor cannot be derived, the row is left with an empty factor and
 * an empty stock_qty so the caller can block the save with a real message
 * instead of posting a wrong number.
 */
export function applyMeasuredTotal(row, total) {
  if (!needsMeasuredTotal(row, row.uom)) {
    const q = Number(row.qty);
    return {
      ...row,
      measured_total: "",
      conversion_factor: 1,
      stock_qty: Number.isFinite(q) ? q : "",
    };
  }

  const factor = computeFactor(row.qty, total);
  const t = Number(total);
  const hasTotal = total !== "" && total !== null && total !== undefined && Number.isFinite(t);

  if (!hasTotal || factor === null) {
    return { ...row, measured_total: total ?? "", conversion_factor: "", stock_qty: "" };
  }
  return { ...row, measured_total: t, conversion_factor: factor, stock_qty: t };
}

/**
 * Client-side pre-check for one line. Mirrors ERPNext so a save is not spent
 * discovering something we already knew.
 *
 * @returns {string|null} an i18n key, or null when the line is sound
 */
export function validateLineRow(row, info, t) {
  const qty = Number(row.qty);
  const rules = wholeNumberRules(info, row.uom);

  if (!Number.isFinite(qty) || qty <= 0) {
    return t("store.validation.qtyGtZero");
  }

  if (needsMeasuredTotal(info, row.uom)) {
    if (row.measured_total === "" || row.measured_total === undefined || row.measured_total === null) {
      // Required, not optional. Defaulting to a factor of 1 here would book the
      // transaction quantity as stock and read as a successful save.
      return t("store.receipt.validation.totalRequired", { uom: info.stock_uom });
    }
    const total = Number(row.measured_total);
    if (!Number.isFinite(total) || total <= 0) {
      return t("store.receipt.validation.totalInvalid", { uom: info.stock_uom });
    }
  }

  // Rule 3, enforced independently of whether the total field was shown.
  // `needsMeasuredTotal` already hides the field for a whole-number stock UOM,
  // so this is the second line of defence -- but it is the rule ERPNext
  // actually enforces (purchase_receipt.py:278 checks stock_qty against the
  // STOCK uom), so it must not depend on a UI decision to be checked at all.
  const stockQty = Number(row.stock_qty);
  if (rules.mustWholeStock && row.stock_qty !== "" && Number.isFinite(stockQty) && stockQty % 1 !== 0) {
    return t("store.receipt.validation.wholeNumberUom", { uom: info.stock_uom });
  }

  if (rules.mustWholeQty && qty % 1 !== 0) {
    return t("store.receipt.validation.wholeNumberUom", { uom: row.uom });
  }

  return null;
}

/* ===========================================================================
   Serial numbers and batches
   ---------------------------------------------------------------------------
   One rule drives everything here, and it is ERPNext's, not ours:

   For a serialised item the number of serial numbers must equal the quantity in
   STOCK UOM.

   `erpnext/stock/serial_batch_bundle.py` creates one `Serial and Batch Entry`
   per serial -- whose `qty` defaults to 1 -- and then asserts the bundle total
   equals the Stock Ledger Entry's `actual_qty`, which is in stock UOM. Separately
   `erpnext/stock/utils.py:get_valid_serial_nos` throws when the count does not
   match the qty it is handed.

   So a weighed item stocked in Kg takes one serial per Kg. 12.5 Kg would need
   12.5 serials, which cannot exist, and the save fails with "Total qty ... is not
   equal to Actual Qty" -- not with anything that names the real problem.

   That makes "whole stock_qty" a HARD requirement for a serialised item even
   when the UOM itself permits fractions, which is why it is checked here rather
   than left to `must_be_whole_number`.

   Per-serial weight and price are DERIVED, never stored. Neither `Serial No`,
   `Serial and Batch Bundle` nor `Serial and Batch Entry` has a weight field, and
   their rate fields are `read_only` / `no_copy` -- ERPNext derives them from the
   row. Per-serial weight is therefore 1 stock unit by construction.
   =========================================================================== */

/** Does this item carry serial numbers at all? */
export function needsSerials(info) {
  return !!info && Number(info.has_serial_no) === 1;
}

/** True when ERPNext will generate the serials from the item's series. */
export function serialsAreGenerated(info) {
  return needsSerials(info) && !!info?.serial_no_series;
}

/** "auto" | "required" | "none" -- whether the user must supply a batch number. */
export function batchRule(info) {
  if (!info || Number(info.has_batch_no) !== 1) return "none";
  return Number(info.create_new_batch) === 1 && info?.batch_number_series
    ? "auto"
    : "required";
}

/**
 * How many serials this row needs: one per STOCK unit, per the rule above.
 * Fractional stock_qty has no valid answer, so this reports what was asked for
 * and `validateSerials` refuses it.
 */
export function serialCount(row) {
  const stockQty = Number(row?.stock_qty);
  if (row?.stock_qty === "" || row?.stock_qty == null || !Number.isFinite(stockQty)) {
    return 0;
  }
  return Math.round(stockQty);
}

/** Split a textarea value into serials, the way ERPNext's own parser does. */
export function parseSerials(value) {
  return String(value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Derived, read-only per-serial figures. Never an input. */
export function perSerialFigures(row) {
  const count = serialCount(row);
  const stockQty = Number(row?.stock_qty) || 0;
  const rate = Number(row?.rate) || 0;
  return {
    count,
    // One serial is one stock unit, so each carries exactly 1 of the stock UOM.
    weightPerSerial: count > 0 ? stockQty / count : 0,
    // ERPNext values from the row rate against stock_qty, so the per-serial
    // figure is that same rate -- shown for the user's benefit, never posted.
    ratePerSerial: count > 0 ? (stockQty > 0 ? rate : 0) : 0,
    total: stockQty * rate,
  };
}

/**
 * Validate the serial side of a row. Returns an i18n key string or null.
 *
 * Order matters: the whole-number check comes first because a fractional
 * stock_qty makes the required count meaningless, and reporting "expected 13
 * serials" for a quantity that cannot exist would send the user hunting.
 */
export function validateSerials(row, info) {
  if (!needsSerials(info)) return null;

  const stockQty = Number(row?.stock_qty);
  if (row?.stock_qty === "" || row?.stock_qty == null || !Number.isFinite(stockQty)) {
    return "store.receipt.validation.serialNeedsQty";
  }
  if (stockQty <= 0) {
    return "store.receipt.validation.serialNeedsPositiveQty";
  }
  if (stockQty % 1 !== 0) {
    return "store.receipt.validation.serialWholeStockQty";
  }

  if (serialsAreGenerated(info)) return null;

  const entered = parseSerials(row?.serial_no);
  const expected = serialCount(row);
  if (entered.length !== expected) {
    return "store.receipt.validation.serialCountMismatch";
  }
  if (new Set(entered).size !== entered.length) {
    return "store.receipt.validation.serialDuplicate";
  }
  return null;
}

/** Validate the batch side of a row. Returns an i18n key string or null. */
export function validateBatch(row, info) {
  const rule = batchRule(info);
  if (rule === "none") return null;
  if (rule === "auto") return null;
  return row?.batch_no && String(row.batch_no).trim()
    ? null
    : "store.receipt.validation.batchRequired";
}
