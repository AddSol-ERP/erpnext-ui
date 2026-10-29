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

function side(frm) {
	return BUYING.includes(frm.doctype) ? "buying" : "selling";
}

// Resolve item pricing through API.
// force=true always calls API on item selection.
function resolve(frm, item_code, callback, force = false) {
	if (!item_code) {
		callback({
			enabled: false,
			pricing_uom: null,
		});
		return;
	}

	const cache_key = side(frm) + "::" + item_code;

	if (!force && Object.prototype.hasOwnProperty.call(CACHE, cache_key)) {
		callback(CACHE[cache_key]);
		return;
	}

	frappe.call({
		method: "erpnext_ui.api.get_item_pricing",
		args: {
			item_code: item_code,
			side: side(frm),
		},
		callback: function (r) {
			const msg = (r && r.message) || {};

			const result = {
				enabled: !!(msg.enabled && msg.pricing_uom),
				pricing_uom: msg.pricing_uom || null,
			};

			CACHE[cache_key] = result;
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

// Get the appropriate label for the complete document.
function relabel(frm) {
	if (!frm || !frm.fields_dict.items) return;

	const grid = frm.fields_dict.items.grid;
	const items = frm.doc.items || [];

	grid.update_docfield_property(FIELD, "hidden", 0);

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

// Update grid column and open item dialog label.
function update_label(frm, label) {
	const grid = frm.fields_dict.items.grid;

	try {
		grid.update_docfield_property(FIELD, "label", label);
		grid.update_docfield_property(FIELD, "hidden", 0);
	} catch (e) {
		// Ignore grid refresh issues.
	}

	const open_row = grid.open_grid_row;

	if (open_row && open_row.grid_form) {
		const field = open_row.grid_form.fields_dict[FIELD];

		if (field) {
			field.df.label = label;
			field.df.hidden = 0;
			field.refresh();
		}
	}
}

// Enable or disable the field for a particular child row.
function set_row_field(frm, row, enabled) {
	if (!frm || !row || !frm.fields_dict.items) return;

	const grid = frm.fields_dict.items.grid;

	// Field must always remain visible.
	grid.update_docfield_property(FIELD, "hidden", 0);

	const grid_row = grid.grid_rows_by_docname && grid.grid_rows_by_docname[row.name];

	if (grid_row) {
		// Apply editability to this particular grid row.
		if (typeof grid_row.toggle_editable === "function") {
			grid_row.toggle_editable(FIELD, enabled);
		}

		// Update item edit dialog if it is already open.
		const grid_form = grid_row.grid_form;

		if (grid_form && grid_form.fields_dict[FIELD]) {
			const field = grid_form.fields_dict[FIELD];

			field.df.hidden = 0;
			field.df.read_only = enabled ? 0 : 1;
			field.refresh();
		}
	}

	// Also handle currently open grid dialog.
	const open_row = grid.open_grid_row;

	if (
		open_row &&
		open_row.doc &&
		open_row.doc.name === row.name &&
		open_row.grid_form &&
		open_row.grid_form.fields_dict[FIELD]
	) {
		const field = open_row.grid_form.fields_dict[FIELD];

		field.df.hidden = 0;
		field.df.read_only = enabled ? 0 : 1;
		field.refresh();
	}
}

// Fetch pricing and apply the result to the selected item.
function apply_item_pricing(frm, row, force = false) {
	if (!row) return;

	const cdn = row.name;

	REQUESTS[cdn] = (REQUESTS[cdn] || 0) + 1;

	const request_id = REQUESTS[cdn];
	const item_code = row.item_code;

	if (!item_code) {
		set_row_field(frm, row, false);
		relabel(frm);
		return;
	}

	// Disable while resolving the selected item.
	set_row_field(frm, row, false);

	resolve(
		frm,
		item_code,
		function (result) {
			// Ignore outdated responses.
			if (REQUESTS[cdn] !== request_id || row.item_code !== item_code) {
				return;
			}

			// Enable only when a valid pricing rule exists.
			set_row_field(frm, row, result.enabled);

			// Recalculate common UOM label.
			relabel(frm);
		},
		force,
	);
}

// Register generic handlers for all doctypes.
ALL.forEach(function (dt) {
	const child = CHILD[dt];

	frappe.ui.form.on(dt, {
		refresh(frm) {
			const grid = frm.fields_dict.items.grid;

			// Never hide the custom field.
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

			set_row_field(frm, row, false);
			relabel(frm);
		},

		items_remove(frm) {
			relabel(frm);
		},
	});

	frappe.ui.form.on(child, {
		// Called whenever an item is selected or changed.
		item_code(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			// Force API call on every item selection.
			apply_item_pricing(frm, row, true);
		},

		// Reapply field properties when item dialog opens.
		form_render(frm, cdt, cdn) {
			const row = locals[cdt][cdn];

			apply_item_pricing(frm, row, false);
		},
	});
});
