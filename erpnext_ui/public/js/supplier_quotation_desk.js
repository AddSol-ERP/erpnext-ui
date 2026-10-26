// The stock Supplier Quotation form has an Email action, but it is buried in
// the menu (Ctrl+E). This adds the same send as a visible one-click button,
// using the app's configured template and PDF format.
//
// The endpoint loads the stored document, so sending while the form is dirty
// would email the old contact/values. Save first rather than guessing which
// version the user meant.
frappe.ui.form.on("Supplier Quotation", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.docstatus === 2 || !frm.doc.supplier) {
			return;
		}
		if (!frappe.model.can_email(null, frm)) {
			return;
		}

		frm.add_custom_button(__("Email Supplier"), () => {
			if (frm.is_dirty()) {
				frappe.msgprint(__("Save the Supplier Quotation before sending it."));
				return;
			}

			frappe.confirm(
				__("Send {0} to the supplier's contact by email?", [frm.doc.name]),
				() => {
					frappe.call({
						method: "erpnext_ui.supplier_quotation.send_supplier_quotation_email",
						args: { supplier_quotation: frm.doc.name },
						freeze: true,
						freeze_message: __("Sending Supplier Quotation..."),
						callback(r) {
							if (r.exc || !r.message) {
								return;
							}
							frappe.show_alert({
								message: __("Supplier Quotation sent to {0}", [r.message.recipient]),
								indicator: "green",
							});
						},
					});
				},
			);
		});
	},
});
