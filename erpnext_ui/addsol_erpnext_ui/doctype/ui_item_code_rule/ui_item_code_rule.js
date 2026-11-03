frappe.ui.form.on("UI Item Code Rule", {
	refresh(frm) {
		frm.add_custom_button(__("Insert Field or Parameter"), async () => {
			const response = await frappe.call({
				method: "erpnext_ui.item_naming.get_item_code_tokens",
				args: { item_group: frm.doc.item_group },
			});
			const tokens = response.message || [];
			const dialog = new frappe.ui.Dialog({
				title: __("Insert Field or Parameter"),
				fields: [{ fieldname: "token", fieldtype: "Select", label: __("Field or Parameter"), reqd: 1,
					options: tokens.map((entry) => ({ value: entry.token, label: `${entry.label} — {${entry.token}}` })) }],
				primary_action_label: __("Append to Pattern"),
				primary_action(values) {
					frm.set_value("pattern", (frm.doc.pattern || "") + `{${values.token}}`);
					dialog.hide();
				},
			});
			dialog.show();
		});
	},
});
