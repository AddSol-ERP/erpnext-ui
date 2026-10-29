// Generic Desk behavior for the UOM pricing per-UOM rate column.
//
// - The column header reads "Rate per UOM" by default. When every priced item on
//   the document shares one pricing UOM, relabel the column to "Rate per <UOM>"
//   (e.g. "Rate per Kg"). Mixed UOMs fall back to the generic label.
// - When no item on the document has UOM pricing enabled, the column is hidden
//   so standard documents stay clean.
//
// Runs on every buying/selling doctype that carries a `custom_rate_per_pricing_uom`
// field on its item child table.

const BUYING_DOCTYPES = ["Purchase Receipt", "Purchase Invoice", "Purchase Order", "Supplier Quotation"];
const SELLING_DOCTYPES = ["Sales Invoice", "Sales Order", "Delivery Note", "Quotation", "POS Invoice"];
const PRICED_DOCTYPES = BUYING_DOCTYPES.concat(SELLING_DOCTYPES);

// Map each parent doctype to its item child doctype so we can react to
// item_code changes on existing rows (selecting an item does not fire
// items_add, so without this the per-UOM column stays hidden until refresh).
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

function refresh_uom_rate_column(frm) {
	if (!frm || !frm.fields_dict || !frm.fields_dict.items) return;
	const grid = frm.fields_dict.items.grid;
	if (!grid) return;

	const items = frm.doc.items || [];
	if (!items.length) {
		grid.set_column_disp("custom_rate_per_pricing_uom", false);
		return;
	}

	// Resolve pricing UOM per item via the backend; cache on the item row.
	const side = BUYING_DOCTYPES.indexOf(frm.doctype) >= 0 ? "buying" : "selling";
	const promises = items.map(function (row) {
		if (!row.item_code) return Promise.resolve(null);
		return new Promise(function (resolve) {
			frappe.call({
				method: "erpnext_ui.api.get_item_pricing",
				args: { item_code: row.item_code, side: side },
				async: true,
				callback: function (r) {
					const msg = r && r.message;
					resolve((msg && msg.enabled && msg.pricing_uom) ? msg.pricing_uom : null);
				},
			});
		});
	});

	Promise.all(promises).then(function (uoms) {
		const priced = uoms.filter(Boolean);
		if (!priced.length) {
			grid.set_column_disp("custom_rate_per_pricing_uom", false);
			return;
		}
		grid.set_column_disp("custom_rate_per_pricing_uom", true);
		const unique = Array.from(new Set(priced));
		let label = __("Rate per UOM");
		if (unique.length === 1) {
			label = __("Rate per {0}", [unique[0]]);
		}
		try {
			grid.update_docfield_property("custom_rate_per_pricing_uom", "label", label);
		} catch (e) {
			// Fall back: try the form-level df property.
			try {
				frm.set_df_property("custom_rate_per_pricing_uom", "label", label, "items");
			} catch (e2) {
				// no-op
			}
		}
		frm.refresh_field("items");
	});
}

PRICED_DOCTYPES.forEach(function (dt) {
	frappe.ui.form.on(dt, {
		refresh: function (frm) {
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
