frappe.ui.form.on("UI Item Code Rule", {
	refresh(frm) {
		frm.set_intro(__("Legacy archive. Configure Item Naming on UI Uom Pricing Rule instead."));
		frm.add_custom_button(__("Open Pricing Rules"), () => {
			frappe.set_route("List", "UI Uom Pricing Rule", { item_group: frm.doc.item_group });
		});
	},
});
