// Keep the Item-configured estimate separate from the operator's actual measure.
const BUYING = ["Purchase Receipt", "Purchase Invoice", "Purchase Order", "Supplier Quotation", "Material Request"];
const SELLING = ["Sales Invoice", "Sales Order", "Delivery Note", "Quotation", "POS Invoice"];
const REQUESTS = {};

// Extend only the PO update dialog; keep ERPNext's own fields and row controls.
function install_purchase_order_update_pricing() {
	if (typeof erpnext === "undefined" || !erpnext.utils?.update_child_items || erpnext.utils.update_child_items.__uom_pricing) return;
	const original = erpnext.utils.update_child_items;
	function update_child_items_with_pricing(opts) {
		if (opts.frm?.doctype !== "Purchase Order" || opts.child_docname !== "items") return original.apply(this, arguments);
		const Dialog = frappe.ui.Dialog;
		frappe.ui.Dialog = function (config) {
			const table = config.fields?.find((field) => field.fieldname === "trans_items" && field.fieldtype === "Table");
			if (table) {
				table.fields.push({ fieldname: "custom_rate_per_pricing_uom", fieldtype: "Float", label: __("Rate per Pricing UOM"), in_list_view: 1 });
				const byName = new Map((opts.frm.doc.items || []).map((row) => [row.name, row]));
				(table.data || []).forEach((row) => { row.custom_rate_per_pricing_uom = byName.get(row.docname)?.custom_rate_per_pricing_uom || 0; });
				config.update_items = function () {
					const rows = this.get_values()?.trans_items;
					if (!rows) return;
					frappe.call({ method: "erpnext_ui.purchase_order_update.update_items", freeze: true,
						args: { parent_doctype_name: opts.frm.doc.name, trans_items: rows.filter((row) => row.item_code) },
						callback: () => { this.hide(); opts.frm.reload_doc(); } });
				};
			}
			return new Dialog(config);
		};
		try { return original.apply(this, arguments); }
		finally { frappe.ui.Dialog = Dialog; }
	}
	update_child_items_with_pricing.__uom_pricing = true;
	erpnext.utils.update_child_items = update_child_items_with_pricing;
}

function pricing_side(frm) {
	return BUYING.includes(frm.doctype) ? "buying" : "selling";
}

function pricing_grid_row(frm, row) {
	return frm.fields_dict.items?.grid?.grid_rows?.find((entry) => entry.doc.name === row.name);
}

function show_pricing_estimate(frm, row, estimate) {
	const gridRow = pricing_grid_row(frm, row);
	if (gridRow) {
		gridRow.toggle_editable("custom_rate_per_pricing_uom", !!estimate.enabled && !frm.doc.docstatus);
		gridRow.toggle_editable("custom_chargeable_qty", !!estimate.enabled && !frm.doc.docstatus);
		gridRow.toggle_editable("custom_estimated_chargeable_qty", false);
		gridRow.toggle_editable("custom_estimated_pricing_amount", false);
		// The expanded child form may hold its own field definition. Update it
		// alongside the inline grid so opening a row cannot retain a stale lock.
		["custom_rate_per_pricing_uom", "custom_chargeable_qty"].forEach((name) => {
			const control = gridRow.grid_form?.fields_dict?.[name];
			if (control) {
				control.df.read_only = !(estimate.enabled && !frm.doc.docstatus);
				control.refresh();
			}
		});
		const field = gridRow.grid_form?.fields_dict?.custom_estimated_chargeable_qty;
		if (field) {
			field.df.label = __("Estimated Chargeable Qty") + (estimate.pricing_uom ? ` (${estimate.pricing_uom})` : "");
			field.refresh();
		}
	}
}

function show_saved_pricing_estimate(frm, row) {
	show_pricing_estimate(frm, row, { enabled: !!row.custom_pricing_uom, pricing_uom: row.custom_pricing_uom });
}

function refresh_pricing_editability(frm, row) {
	if (frm.doc.docstatus || !row.item_code || (frm.doctype === "Material Request" && frm.doc.material_request_type !== "Purchase")) {
		show_pricing_estimate(frm, row, { enabled: false });
		return;
	}
	if (row.custom_pricing_uom) {
		show_saved_pricing_estimate(frm, row);
		return;
	}
	// Opening a newly selected row can precede the estimate response. Resolve
	// editability separately from quantity/estimate, without dirtying the PO.
	const item = row.item_code;
	const seq = REQUESTS[row.name] || 0;
	frappe.call({
		method: "erpnext_ui.api.get_item_pricing",
		args: { item_code: item, side: pricing_side(frm) },
		callback(r) {
			if (row.item_code !== item || (REQUESTS[row.name] || 0) !== seq || !(frm.doc.items || []).includes(row)) return;
			show_pricing_estimate(frm, row, r.message || {});
		},
	});
}

function refresh_saved_pricing_estimates(frm) {
	// Refresh also runs after Save. Never write previews back into saved rows:
	// null versus a stored numeric zero alone can mark the document unsaved.
	(frm.doc.items || []).forEach((row) => {
		show_saved_pricing_estimate(frm, row);
	});
}

function update_pricing_estimate(frm, row) {
	if (!row) return;
	const seq = REQUESTS[row.name] = (REQUESTS[row.name] || 0) + 1;
	const item = row.item_code;
	const qty = row.qty;
	const current = () => REQUESTS[row.name] === seq && row.item_code === item && row.qty === qty && (frm.doc.items || []).includes(row);
	if (frm.doc.docstatus) {
		// Submitted documents show the stored baseline, even if Item rules changed.
		show_pricing_estimate(frm, row, { enabled: !!row.custom_pricing_uom, pricing_uom: row.custom_pricing_uom });
		return;
	}
	if (!item || !(Number(qty) > 0) || (frm.doctype === "Material Request" && frm.doc.material_request_type !== "Purchase")) {
		refresh_pricing_editability(frm, row);
		frappe.model.set_value(row.doctype, row.name, { custom_estimated_chargeable_qty: null, custom_estimated_pricing_amount: null });
		return;
	}
	frappe.call({
		method: "erpnext_ui.api.get_uom_pricing_estimate",
		args: { item_code: item, doc_qty: qty, side: pricing_side(frm) },
		callback(r) {
			if (!current()) return;
			const estimate = r.message || {};
			const baseline = estimate.calculated_chargeable_qty ?? null;
			const rate = row.custom_rate_per_pricing_uom;
			frappe.model.set_value(row.doctype, row.name, {
				custom_pricing_uom: estimate.pricing_uom || "",
				custom_estimated_chargeable_qty: baseline,
				custom_estimated_pricing_amount: baseline != null && rate !== "" && rate != null ? baseline * Number(rate) : null,
			});
			show_pricing_estimate(frm, row, estimate);
		},
		error() {
			if (!current()) return;
			frappe.model.set_value(row.doctype, row.name, { custom_estimated_chargeable_qty: null, custom_estimated_pricing_amount: null });
		},
	});
}

BUYING.concat(SELLING).forEach((doctype) => {
	const child = doctype === "Quotation" ? "Quotation Item" : `${doctype} Item`;
	frappe.ui.form.on(doctype, {
		refresh(frm) {
			if (frm.doctype === "Purchase Order") install_purchase_order_update_pricing();
			refresh_saved_pricing_estimates(frm);
		},
		before_save(frm) {
			(frm.doc.items || []).forEach((row) => { REQUESTS[row.name] = (REQUESTS[row.name] || 0) + 1; });
		},
		material_request_type(frm) { (frm.doc.items || []).forEach((row) => update_pricing_estimate(frm, row)); },
	});
	const refreshRow = (frm, cdt, cdn) => update_pricing_estimate(frm, locals[cdt]?.[cdn]);
	frappe.ui.form.on(child, {
		item_code: refreshRow,
		qty: refreshRow,
		custom_rate_per_pricing_uom: refreshRow,
		custom_chargeable_qty: refreshRow,
		form_render(frm, cdt, cdn) {
			const row = locals[cdt]?.[cdn];
			if (row) refresh_pricing_editability(frm, row);
		},
	});
});
