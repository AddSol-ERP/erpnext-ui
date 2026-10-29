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

// Get the actual GridRow instance.
function get_grid_row(frm, row) {
	if (!frm || !row || !frm.fields_dict.items) return null;

	const grid = frm.fields_dict.items.grid;

	return (grid.grid_rows || []).find(function (grid_row) {
		return grid_row.doc && grid_row.doc.name === row.name;
	});
}

// Apply properties to the actual child row and open modal.
function set_row_field(frm, row, enabled) {
	const grid_row = get_grid_row(frm, row);

	if (!grid_row) return;

	// Update the row-specific DocField.
	const df = (grid_row.docfields || []).find(function (field) {
		return field.fieldname === FIELD;
	});

	if (df) {
		df.hidden = 0;
		df.read_only = enabled ? 0 : 1;
	}

	// IMPORTANT:
	// This updates both the open GridRowForm and grid controls.
	// Frappe v15 implements this method on GridRow.
	grid_row.toggle_editable(FIELD, enabled);

	// Keep field visible in the row.
	grid_row.toggle_display(FIELD, true);
}

// Update label in grid and every row's modal DocField.
function update_label(frm, label) {
	if (!frm || !frm.fields_dict.items) return;

	const grid = frm.fields_dict.items.grid;

	grid.update_docfield_property(FIELD, "hidden", 0);
	grid.update_docfield_property(FIELD, "label", label);

	(grid.grid_rows || []).forEach(function (grid_row) {
		const df = (grid_row.docfields || []).find(function (field) {
			return field.fieldname === FIELD;
		});

		if (df) {
			df.hidden = 0;
			df.label = label;
		}

		// Update the field if its modal is already open.
		if (typeof grid_row.set_field_property === "function") {
			grid_row.set_field_property(FIELD, "label", label);
		}
	});
}

// Best-effort dynamic column label.
function relabel(frm) {
	if (!frm || !frm.fields_dict.items) return;

	const items = frm.doc.items || [];

	if (!items.length) {
		update_label(frm, __("Rate per UOM"));
		return;
	}

	const uoms = [];
	let pending = items.length;

	items.forEach(function (row) {
		resolve(frm, row.item_code, function (result) {
			if (result.pricing_uom) {
				uoms.push(result.pricing_uom);
			}

			pending--;

			if (pending === 0) {
				const unique = [...new Set(uoms)];

				let label = __("Rate per UOM");

				if (unique.length === 1) {
					label = __("Rate per {0}", [unique[0]]);
				}

				update_label(frm, label);
			}
		});
	});
}

// Fetch and apply pricing for a particular item row.
function apply_item_pricing(frm, row, force = false) {
	if (!row) return;

	const cdn = row.name;
	const item_code = row.item_code;

	REQUESTS[cdn] = (REQUESTS[cdn] || 0) + 1;

	const request_id = REQUESTS[cdn];

	if (!item_code) {
		set_row_field(frm, row, false);
		relabel(frm);
		return;
	}

	// Initially disable while pricing is being resolved.
	set_row_field(frm, row, false);

	resolve(
		frm,
		item_code,
		function (result) {
			// Ignore outdated responses.
			if (REQUESTS[cdn] !== request_id || row.item_code !== item_code) {
				return;
			}

			// Enable only when pricing rule is applicable.
			set_row_field(frm, row, result.enabled);

			relabel(frm);
		},
		force,
	);
}

// Register handlers for all Buying and Selling doctypes.
ALL.forEach(function (dt) {
	const child = CHILD[dt];

	frappe.ui.form.on(dt, {
		refresh(frm) {
			const grid = frm.fields_dict.items.grid;

			// Always visible.
			grid.update_docfield_property(FIELD, "hidden", 0);

			(frm.doc.items || []).forEach(function (row) {
				apply_item_pricing(frm, row, false);
			});

			relabel(frm);
		},

		after_save(frm) {
			relabel(frm);
		},

		items_add(frm, cdt, cdn) {
			const row = locals[child][cdn];

			if (row) {
				set_row_field(frm, row, false);
			}

			relabel(frm);
		},

		items_remove(frm) {
			relabel(frm);
		},
	});

	frappe.ui.form.on(child, {
		// API call whenever item is selected or changed.
		item_code(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			apply_item_pricing(frm, row, true);
		},

		// IMPORTANT: Runs when the item edit modal is opened.
		form_render(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			if (!row) return;

			// Apply cached result or fetch pricing if necessary.
			apply_item_pricing(frm, row, false);
		},
	});
});
