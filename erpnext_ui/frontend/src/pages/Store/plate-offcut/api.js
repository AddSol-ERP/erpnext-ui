import { get } from "../../../services/api";

/**
 * The cutting module's two tab feeds, both from addsol_nl_custom.
 *
 * Neither can be a `resource/<doctype>` list. A plate's weight lives on Serial No,
 * its heat on Batch and its size on Item, so "what can I cut" is a three-table
 * join. Frappe's get_list cannot express that without a child-table filter, which
 * resolves against the PARENT meta and silently cross-joins -- and the same trap
 * applies to reading an offcut's length back off Plate Offcut Item. Both live in
 * the owning app for that reason, and `getAvailablePlates` / `getOffcutStock`
 * already clamp their own page length.
 */

const API = "addsol_nl_custom.addsol_nl_custom.plates.api";

export const AVAILABLE_PLATES_METHOD = `${API}.get_available_plates`;
export const OFFCUT_STOCK_METHOD = `${API}.get_offcut_stock`;

/**
 * Active serial plates that have not been cut.
 *
 * `can_cut` is returned rather than filtered, so a plate with no recorded weight
 * is shown with the reason instead of vanishing -- an operator looking for it
 * should be told it is unusable, not left wondering where it went.
 *
 * @returns {Promise<{plates: Array<object>, total: number}>}
 */
export async function fetchAvailablePlates({
  search = "",
  warehouse = "",
  limitStart = 0,
  pageLength = 20,
} = {}) {
  const res = await get(`method/${AVAILABLE_PLATES_METHOD}`, {
    search: search || undefined,
    warehouse: warehouse || undefined,
    limit_start: limitStart,
    limit_page_length: pageLength,
  });
  return {
    plates: res?.message?.plates || [],
    total: Number(res?.message?.total) || 0,
  };
}

/**
 * Offcut pieces in stock, each pointing back to the plate it came from.
 *
 * @returns {Promise<{pieces: Array<object>, total: number}>}
 */
export async function fetchOffcutStock({
  search = "",
  limitStart = 0,
  pageLength = 20,
} = {}) {
  const res = await get(`method/${OFFCUT_STOCK_METHOD}`, {
    search: search || undefined,
    limit_start: limitStart,
    limit_page_length: pageLength,
  });
  return {
    pieces: res?.message?.pieces || [],
    total: Number(res?.message?.total) || 0,
  };
}