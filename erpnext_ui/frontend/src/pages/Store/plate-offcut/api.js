import { get } from "../../../services/api";

/**
 * The cutting module's two tab feeds, both from addsol_nl_custom.
 *
 * Neither can be a `resource/<doctype>` list. A plate's weight lives on Serial No,
 * its heat on Batch and its size on Item, so "what can I cut" is a three-table
 * join. Frappe's get_list cannot express that without a child-table filter, which
 * resolves against the PARENT meta and silently cross-joins -- and the same trap
 * applies to reading an offcut's length back off Plate Offcut Item. Both live in
 * the owning app for that reason, and each already clamps its own page length.
 *
 * `get_available_plates` GROUPS BY item and pages by item, and returns the
 * per-item totals with it. That has to stay server-side: grouping a page of
 * serials here made a parent row's count describe the page rather than the item,
 * and split any item whose plates straddled a page boundary into two groups.
 */

const API = "addsol_nl_custom.addsol_nl_custom.plates.api";

export const AVAILABLE_PLATES_METHOD = `${API}.get_available_plates`;
export const OFFCUT_STOCK_METHOD = `${API}.get_offcut_stock`;

/**
 * Plate ITEMS awaiting a cut, each carrying its own plates.
 *
 * `limitStart` / `pageLength` are ITEMS, not plates: the server groups and pages
 * on item_code, so a page of ten is ten rows in the list, whatever the plate
 * count behind them.
 *
 * A plate that cannot be cut is returned with its reason rather than filtered
 * out -- an operator looking for it should be told it is unusable, not left
 * wondering where it went.
 *
 * @returns {Promise<{groups: Array<object>, total: number}>}
 */
export async function fetchAvailablePlates({
  search = "",
  warehouse = "",
  limitStart = 0,
  pageLength = 10,
} = {}) {
  const res = await get(`method/${AVAILABLE_PLATES_METHOD}`, {
    search: search || undefined,
    warehouse: warehouse || undefined,
    limit_start: limitStart,
    limit_page_length: pageLength,
  });
  return {
    groups: res?.message?.groups || [],
    // `total` counts GROUPS, so this is the number of pages, not of plates.
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