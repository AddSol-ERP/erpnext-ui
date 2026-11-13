// Preserve existing Desk bookmarks after moving the feature into the React app.
frappe.pages["essl-attendance-import"].on_page_load = function () {
	window.location.replace("/addsol_ui#/hr/attendance-import");
};
