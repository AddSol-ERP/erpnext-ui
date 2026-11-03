frappe.ui.form.on("UI Uom Pricing Rule", {
	refresh(frm) {
		frm.add_custom_button(__("Insert Field or Parameter"), async () => {
			const response = await frappe.call({
				method: "erpnext_ui.item_naming.get_item_code_tokens",
				args: {},
			});
			const tokens = [...(response.message || []), ...(frm.doc.params || []).filter(row => row.symbol).map(row => ({ token: `param.${row.symbol}`, label: row.label || row.symbol }))];
			const dialog = new frappe.ui.Dialog({
				title: __("Insert Field or Parameter"),
				fields: [{ fieldname: "token", fieldtype: "Select", label: __("Field or Parameter"), reqd: 1,
					options: tokens.map((entry) => ({ value: entry.token, label: `${entry.label} — {${entry.token}}` })) }],
				primary_action_label: __("Append to Pattern"),
				primary_action(values) {
					frm.set_value("item_code_pattern", (frm.doc.item_code_pattern || "") + `{${values.token}}`);
					dialog.hide();
				},
			});
			dialog.show();
		});
	},
});
