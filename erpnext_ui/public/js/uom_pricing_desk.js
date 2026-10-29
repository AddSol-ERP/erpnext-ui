// Generic Desk behavior for the UOM pricing per-UOM rate column.
//
// The `custom_rate_per_pricing_uom` field is always visible in the item table
// and edit modal. It is enabled only for items that actually have UOM pricing
// configured (and only when the relevant feature switch is on); for all other
// items it stays disabled, so users cannot type a per-UOM rate that would be
// ignored. The column header reads "Rate per UOM" by default and becomes
// "Rate per <UOM>" when every priced item on the document shares one UOM.

const BUYING_DOCTYPES = ["Purchase Receipt", "Purchase Invoice", "Purchase Order", "Supplier Quotation"];
const SELLING_DOCTYPES = ["Sales Invoice", "Sales Order", "Delivery Note", "Quotation", "POS Invoice"];
const PRICED_DOCTYPES = BUYING_DOCTYPES.concat(SELLING_DOCTYPES);

const ITEM_CHILD_DOCTYPE = {
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

// Cache: item_code -> pricing_uom or null (whether pricing is enabled).
const _pricing_cache = {};

function side_for(frm) {
	return BUYING_DOCTYPES.indexOf(frm.doctype) >= 0 ? "buying" : "selling";
}

function resolve_pricing(frm, item_code, cb) {
	if (!item_code) {
		cb(null);
		return;
	}
	if (Object.prototype.hasOwnProperty.call(_pricing_cache, item_code)) {
		cb(_pricing_cache[item_code]);
		return;
	}
	frappe.call({
		method: "erpnext_ui.api.get_item_pricing",
		args: { item_code: item_code, side: side_for(frm) },
		async: true,
		callback: function (r) {
			const msg = r && r.message;
			const uom = (msg && msg.enabled && msg.pricing_uom) ? msg.pricing_uom : null;
			_pricing_cache[item_code] = uom;
			cb(uom);
		},
	});
}

function refresh_uom_rate_column(frm) {
	if (!frm || !frm.fields_dict || !frm.fields_dict.items) return;
	const grid = frm.fields_dict.items.grid;
	if (!grid) return;

	const items = frm.doc.items || [];
	if (!items.length) {
		// Nothing to price: leave the column visible but disabled.
		try { grid.update_docfield_property("custom_rate_per_pricing_uom", "label", __("Rate per UOM")); } catch (e) {}
		return;
	}

	const uoms = [];
	let pending = items.length;
	items.forEach(function (row) {
		resolve_pricing(frm, row.item_code, function (uom) {
			// Enable/disable the field on this specific row.
			try {
				const grid_row = grid.grid_rows_by_docname && grid.grid_rows_by_docname[row.name];
				if (grid_row && typeof grid_row.toggle_enable === "function") {
					grid_row.toggle_enable("custom_rate_per_pricing_uom", !!uom);
				}
			} catch (e) {
				// Fall back to whole-grid toggle handled below.
			}
			if (uom) uoms.push(uom);
			pending -= 1;
			if (pending === 0) {
				const unique = Array.from(new Set(uoms));
				let label = __("Rate per UOM");
				if (unique.length === 1) {
					label = __("Rate per {0}", [unique[0]]);
				}
				try {
					grid.update_docfield_property("custom_rate_per_pricing_uom", "label", label);
				} catch (e) {
					try { frm.set_df_property("custom_rate_per_pricing_uom", "label", label, "items"); } catch (e2) {}
				}
				frm.refresh_field("items");
			}
		});
	});
}

PRICED_DOCTYPES.forEach(function (dt) {
	frappe.ui.form.on(dt, {
		refresh: function (frm) {
			refresh_uom_rate_column(frm);
		},
		after_save: function (frm) {
			refresh_uom_rate_column(frm);
		},
		items_add: function (frm) {
			refresh_uom_rate_column(frm);
		},
		items_remove: function (frm) {
			refresh_uom_rate_column(frm);
		},
	});
	const child_dt = ITEM_CHILD_DOCTYPE[dt];
	if (child_dt) {
		frappe.ui.form.on(child_dt, {
			item_code: function (frm) {
				refresh_uom_rate_column(frm);
			},
			custom_rate_per_pricing_uom: function (frm) {
				refresh_uom_rate_column(frm);
			},
		});
	}
});
