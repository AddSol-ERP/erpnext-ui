// Desk form script for the Item doctype: renders the UOM Pricing parameter
// inputs dynamically from the effective rule and computes a derived-quantity
// preview. The server remains authoritative; this is a convenience/preview layer.

frappe.ui.form.on("Item", {
	refresh: function (frm) {
		render_uom_pricing(frm);
	},
	item_group: function (frm) {
		// Inherited rule may change with the group; clear override-dependent
		// preview and re-render.
		render_uom_pricing(frm);
	},
	custom_uom_pricing_rule: function (frm) {
		render_uom_pricing(frm);
	},
});

function render_uom_pricing(frm) {
	// Remove any previously rendered parameter inputs.
	frm.fields_dict.custom_uom_pricing_parameters.$wrapper
		.find(".uom-pricing-preview")
		.remove();

	const rule_name =
		frm.doc.custom_uom_pricing_rule ||
		null;

	const resolve = function (name) {
		if (name) {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "UI Uom Pricing Rule", name: name },
				callback: function (r) {
					if (r.message) show_params(frm, r.message);
				},
			});
			return;
		}
		// Inherit from Item Group.
		if (!frm.doc.item_group) return;
		frappe.call({
			method: "erpnext_ui.api.get_item_group_pricing_rules",
			args: { item_group: frm.doc.item_group },
			callback: function (r) {
				const rules = r.message || [];
				if (rules.length) {
					frappe.call({
						method: "frappe.client.get",
						args: { doctype: "UI Uom Pricing Rule", name: rules[0].name },
						callback: function (rr) {
							if (rr.message) show_params(frm, rr.message);
						},
					});
				}
			},
		});
	};

	resolve(rule_name);
}

function show_params(frm, rule) {
	const params = rule.parameters || rule.params || [];
	if (!params.length) return;

	// Build a small preview block listing each parameter with an input bound to
	// the child table row for that symbol (creating one if missing).
	const wrapper = frm.fields_dict.custom_uom_pricing_parameters.$wrapper;
	const $box = $(
		'<div class="uom-pricing-preview" style="margin:8px 0;padding:8px;border:1px solid #ddd;border-radius:6px;">' +
			'<div style="font-weight:600;margin-bottom:6px;">UOM Pricing — ' +
			(rule.pricing_uom || "") +
			" (" +
			(rule.formula_mode || "") +
			")</div>" +
			'<div class="uom-pricing-params"></div>' +
			'<div class="uom-pricing-derived" style="margin-top:8px;font-size:12px;color:#555;"></div>' +
			"</div>",
	);
	wrapper.prepend($box);

	const $params = $box.find(".uom-pricing-params");
	params.forEach(function (p) {
		const symbol = p.symbol;
		// find existing child row
		let row = (frm.doc.custom_uom_pricing_parameters || []).find(function (r) {
			return r.symbol === symbol && r.rule === rule.name;
		});
		if (!row) {
			row = frm.add_child("custom_uom_pricing_parameters", {
				rule: rule.name,
				symbol: symbol,
			});
		}
		const $row = $(
			'<div style="display:flex;gap:8px;align-items:center;margin:4px 0;">' +
				"<label style=\"min-width:140px;\">" +
				(p.label || symbol) +
				(p.required ? " *" : "") +
				(p.uom ? " (" + p.uom + ")" : "") +
				"</label>" +
				'<input type="number" step="any" class="form-control uom-pricing-input" ' +
				'data-symbol="' +
				symbol +
				'" style="max-width:200px;" />' +
				"</div>",
		);
		const $input = $row.find("input");
		$input.val(row.value);
		$input.on("change", function () {
			const v = parseFloat($input.val());
			const target = (frm.doc.custom_uom_pricing_parameters || []).find(function (r) {
				return r.symbol === symbol && r.rule === rule.name;
			});
			if (target) target.value = isNaN(v) ? null : v;
			frm.dirty();
			update_preview(frm, rule);
		});
		$params.append($row);
	});

	update_preview(frm, rule);
}

function update_preview(frm, rule) {
	const params = rule.parameters || rule.params || [];
	const bySymbol = {};
	(frm.doc.custom_uom_pricing_parameters || []).forEach(function (r) {
		if (r.rule === rule.name && r.symbol) {
			const v = parseFloat(r.value);
			if (!isNaN(v)) bySymbol[r.symbol] = v;
		}
	});
	let ok = true;
	params.forEach(function (p) {
		if (p.required && bySymbol[p.symbol] === undefined) ok = false;
	});
	const $derived = $(".uom-pricing-preview .uom-pricing-derived");
	if (!ok) {
		$derived.text("Fill required parameters to see derived quantity.");
		return;
	}
	if ((rule.formula_mode || "") !== "Formula" || !rule.formula_expression) {
		$derived.text("Direct entry: quantity is entered per line.");
		return;
	}
	frappe.call({
		method: "erpnext_ui.api.preview_uom_pricing_formula",
		args: { expression: rule.formula_expression, params: JSON.stringify(bySymbol) },
		callback: function (r) {
			const res = r.message && r.message.result;
			if (res === null || res === undefined) {
				$derived.text("Formula: " + rule.formula_expression);
			} else {
				$derived.text(
					"Derived quantity: " + res + " " + (rule.pricing_uom || "") +
						"   (" + rule.formula_expression + ")",
				);
			}
		},
		error: function () {
			$derived.text("Formula error: " + rule.formula_expression);
		},
	});
}
