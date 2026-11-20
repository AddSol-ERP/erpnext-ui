"""Prepare new BOM drafts without changing their source documents."""

import frappe


def prepare_copy(project, source_bom, source_type="BOM"):
	if source_type not in ("BOM", "UI BOM Template"):
		frappe.throw("Select a BOM or BOM Template.")
	project_doc = frappe.get_doc("Project", project)
	project_doc.check_permission("read")
	frappe.has_permission("BOM", "create", throw=True)
	source = frappe.get_doc(source_type, source_bom)
	source.check_permission("read")
	if source.company != project_doc.company or source.docstatus == 2:
		frappe.throw("Select a non-cancelled BOM in the project company.")
	if source_type == "UI BOM Template":
		if not source.enabled:
			frappe.throw("Select an enabled BOM Template.")
		draft = frappe.new_doc("BOM")
		for field in TEMPLATE_FIELDS:
			draft.set(field, source.get(field))
		for table in ("items", "operations", "scrap_items"):
			for row in source.get(table) or []:
				# Append only business fields, never template child identities/parent links.
				draft.append(table, {key: row.get(key) for key in TABLE_FIELDS[table]})
		if source.routing and not source.get("operations"):
			routing = frappe.get_doc("Routing", source.routing)
			routing.check_permission("read")
			for row in routing.get("operations") or []:
				draft.append("operations", {key: row.get(key) for key in TABLE_FIELDS["operations"]})
		if draft.get("operations"):
			draft.with_operations = 1
	else:
		draft = frappe.copy_doc(source)
	draft.project = project_doc.name
	draft.company = project_doc.company
	draft.is_default = 0
	draft.is_active = 1
	draft.docstatus = 0
	# Exploded materials and totals are derived again by the native BOM controller.
	draft.set("exploded_items", [])
	return draft.as_dict()


TEMPLATE_FIELDS = (
	"item",
	"quantity",
	"uom",
	"with_operations",
	"routing",
	"transfer_material_against",
	"process_loss_percentage",
	"rm_cost_as_per",
	"buying_price_list",
	"currency",
	"conversion_rate",
	"allow_alternative_item",
)
TABLE_FIELDS = {
	"items": (
		"item_code",
		"item_name",
		"description",
		"qty",
		"uom",
		"stock_uom",
		"conversion_factor",
		"bom_no",
		"rate",
	),
	"operations": (
		"operation",
		"workstation",
		"time_in_mins",
		"hour_rate",
		"description",
		"sequence_id",
		"batch_size",
	),
	"scrap_items": ("item_code", "item_name", "stock_qty", "stock_uom", "rate"),
}
