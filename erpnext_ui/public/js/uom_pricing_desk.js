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
	Quotation: "Quotation Item",
	"Supplier Quotation": "Supplier Quotation Item",
	"POS Invoice": "POS Invoice Item",
};

const FIELD = "custom_rate_per_pricing_uom";
const CACHE = {};
const REQUESTS = {};

// Determine buying or selling.
function get_side(frm) {
	return BUYING.includes(frm.doctype) ? "buying" : "selling";
}

// Resolve pricing UOM.
function resolve(frm, item_code, callback, force = false) {
	if (!item_code) {
		callback({ enabled: false, pricing_uom: null });
		return;
	}

	const key = get_side(frm) + "::" + item_code;

	if (!force && Object.prototype.hasOwnProperty.call(CACHE, key)) {
		callback(CACHE[key]);
		return;
	}

	frappe.call({
		method: "erpnext_ui.api.get_item_pricing",
		args: {
			item_code: item_code,
			side: get_side(frm),
		},
		callback: function (r) {
			const msg = (r && r.message) || {};

			const result = {
				enabled: !!(msg.enabled && msg.pricing_uom),
				pricing_uom: msg.pricing_uom || null,
			};

			CACHE[key] = result;
			callback(result);
		},
		error: function () {
			callback({
				enabled: false,
				pricing_uom: null,
			});
		},
	});
}

// Get actual GridRow.
function get_grid_row(frm, row) {
	if (!frm || !row || !frm.fields_dict.items) return null;

	const grid = frm.fields_dict.items.grid;

	return (grid.grid_rows || []).find(function (grid_row) {
		return grid_row.doc && grid_row.doc.name === row.name;
	});
}

// Only control read-only / editable status.
function set_row_field(frm, row, enabled) {
	const grid_row = get_grid_row(frm, row);

	if (!grid_row) return;

	// Update row-specific DocField.
	const df = (grid_row.docfields || []).find(function (field) {
		return field.fieldname === FIELD;
	});

	if (df) {
		df.read_only = enabled ? 0 : 1;
	}

	// Update grid row and open item modal.
	grid_row.toggle_editable(FIELD, enabled);
}

// Apply pricing API response to item row.
function apply_item_pricing(frm, row, force = false) {
	if (!row) return;

	const cdn = row.name;
	const item_code = row.item_code;

	REQUESTS[cdn] = (REQUESTS[cdn] || 0) + 1;

	const request_id = REQUESTS[cdn];

	if (!item_code) {
		set_row_field(frm, row, false);
		return;
	}

	// Read-only until API response.
	set_row_field(frm, row, false);

	resolve(
		frm,
		item_code,
		function (result) {
			// Ignore outdated API responses.
			if (REQUESTS[cdn] !== request_id || row.item_code !== item_code) {
				return;
			}

			// Enable only when pricing rule exists.
			set_row_field(frm, row, result.enabled);
		},
		force,
	);
}

// Register generic handlers for all doctypes.
ALL.forEach(function (dt) {
	const child = CHILD[dt];

	frappe.ui.form.on(dt, {
		refresh(frm) {
			(frm.doc.items || []).forEach(function (row) {
				apply_item_pricing(frm, row, false);
			});
		},

		items_add(frm, cdt, cdn) {
			const row = locals[child][cdn];

			if (row) {
				set_row_field(frm, row, false);
			}
		},
	});

	frappe.ui.form.on(child, {
		// Call API whenever item is selected or changed.
		item_code(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			apply_item_pricing(frm, row, true);
		},

		// Reapply editability when item modal opens.
		form_render(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			if (row) {
				apply_item_pricing(frm, row, false);
			}
		},
	});
});
