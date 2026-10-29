// Generic Desk helper for the UOM pricing per-UOM rate column.
//
// The `custom_rate_per_pricing_uom` field is ALWAYS visible and ALWAYS editable
// in the item table and edit modal. Whether a per-UOM rate actually applies is
// decided server-side (`_apply_uom_pricing` only acts when a rule resolves), so
// the client never has to gate editing on asynchronously-resolved item metadata.
// Gating on async item info was unreliable at selection time, which is exactly
// the symptom reported: the field appeared only after save + refresh.
//
// The only thing this script still does is a best-effort, non-blocking relabel
// of the column header to "Rate per <UOM>" when every priced item on the document
// shares one pricing UOM. It never hides or disables the field.

const BUYING = ["Purchase Receipt", "Purchase Invoice", "Purchase Order", "Supplier Quotation"];
const SELLING = ["Sales Invoice", "Sales Order", "Delivery Note", "Quotation", "POS Invoice"];
const ALL = BUYING.concat(SELLING);
const CHILD = {
    "Purchase Receipt": "Purchase Receipt Item",
    "Purchase Invoice": "Purchase Invoice Item",
    "Purchase Order": "Purchase Order Item",
    "Sales Invoice": "Sales Invoice Item",
    "Sales Order": "Sales Order Item",
    "Delivery Note": "Delivery Note Item",
    "Quotation": "Quotation Item",
    "Supplier Quotation": "Supplier Quotation Item",
    "POS Invoice": "POS Invoice Item",
};
const CACHE = {};

function side(frm) { return BUYING.indexOf(frm.doctype) >= 0 ? "buying" : "selling"; }

function resolve(frm, item_code, cb) {
    if (!item_code) { cb(null); return; }
    if (Object.prototype.hasOwnProperty.call(CACHE, item_code)) { cb(CACHE[item_code]); return; }
    frappe.call({
        method: "erpnext_ui.api.get_item_pricing",
        args: { item_code: item_code, side: side(frm) },
        async: true,
        callback: function (r) {
            const msg = r && r.message;
            const uom = (msg && msg.enabled && msg.pricing_uom) ? msg.pricing_uom : null;
            CACHE[item_code] = uom;
            cb(uom);
        },
    });
}

function relabel(frm) {
    if (!frm || !frm.fields_dict || !frm.fields_dict.items) return;
    const grid = frm.fields_dict.items.grid;
    if (!grid) return;
    const items = frm.doc.items || [];
    if (!items.length) {
        try { grid.update_docfield_property("custom_rate_per_pricing_uom", "label", __("Rate per UOM")); } catch (e) {}
        return;
    }
    const uoms = [];
    let pending = items.length;
    items.forEach(function (row) {
        resolve(frm, row.item_code, function (uom) {
            if (uom) uoms.push(uom);
            pending -= 1;
            if (pending === 0) {
                const unique = Array.from(new Set(uoms));
                let label = __("Rate per UOM");
                if (unique.length === 1) label = __("Rate per {0}", [unique[0]]);
                try { grid.update_docfield_property("custom_rate_per_pricing_uom", "label", label); }
                catch (e) { try { frm.set_df_property("custom_rate_per_pricing_uom", "label", label, "items"); } catch (e2) {} }
            }
        });
    });
}

ALL.forEach(function (dt) {
    frappe.ui.form.on(dt, {
        refresh: function (frm) { relabel(frm); },
        after_save: function (frm) { relabel(frm); },
        items_add: function (frm) { relabel(frm); },
        items_remove: function (frm) { relabel(frm); },
    });
    const child = CHILD[dt];
    if (child) {
        frappe.ui.form.on(child, {
            item_code: function (frm) { relabel(frm); },
        });
    }
});
