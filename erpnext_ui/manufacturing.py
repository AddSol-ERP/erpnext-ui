"""Project manufacturing projections. Native controllers own planning and stock accounting."""

import math

import frappe
from frappe.utils import flt


def readable(doctype, name):
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	return doc


def warehouse(name, company):
	doc = readable("Warehouse", name)
	if doc.company != company or doc.is_group or doc.disabled:
		frappe.throw("Select an enabled leaf warehouse in the project company.")
	return name


def workspace(project):
	"""Read only permission-filtered parents; child rows never bypass their parent."""
	p = readable("Project", project)
	result = {"project": p.as_dict()}
	for key, dt, filters in (
		("boms", "BOM", {"project": project, "is_active": 1}),
		("sales_orders", "Sales Order", {"project": project, "docstatus": 1}),
		("plans", "Production Plan", {"project": project, "docstatus": ["!=", 2]}),
		("work_orders", "Work Order", {"project": project, "docstatus": ["!=", 2]}),
	):
		result[key] = []
		if frappe.has_permission(dt, "read"):
			for row in frappe.get_list(dt, filters=filters, fields=["name"], limit_page_length=0):
				result[key].append(readable(dt, row.name).as_dict())
	result["material_requests"] = []
	if frappe.has_permission("Material Request", "read"):
		# Parent permission filtering first: querying items.project from a parent list cross-joins.
		for row in frappe.get_list(
			"Material Request",
			filters={"docstatus": 1, "company": p.company, "material_request_type": "Manufacture"},
			limit_page_length=0,
		):
			doc = readable("Material Request", row.name)
			if any(item.project == project for item in doc.items):
				result["material_requests"].append({"name": doc.name})
	result["job_cards"] = []
	orders = [d["name"] for d in result["work_orders"]]
	if orders and frappe.has_permission("Job Card", "read"):
		for row in frappe.get_list(
			"Job Card",
			filters={"work_order": ["in", orders], "docstatus": ["!=", 2]},
			fields=["name"],
			limit_page_length=0,
		):
			result["job_cards"].append(readable("Job Card", row.name).as_dict())
	return result


def prepare_plan(project, source, source_name, qty, source_warehouse, fg_warehouse, planned_start):
	"""Build an unsaved native plan; explicitly authorize sources before native SQL/mappers."""
	from erpnext.manufacturing.doctype.production_plan.production_plan import get_items_for_material_requests

	p = readable("Project", project)
	frappe.has_permission("Production Plan", "create", throw=True)
	frappe.has_permission("BOM", "read", throw=True)
	warehouse(source_warehouse, p.company)
	warehouse(fg_warehouse, p.company)
	plan = frappe.new_doc("Production Plan")
	plan.update(
		{
			"company": p.company,
			"project": project,
			"get_items_from": "Sales Order",
			"for_warehouse": source_warehouse,
			"ignore_existing_ordered_qty": 1,
		}
	)
	if source == "BOM":
		bom = readable("BOM", source_name)
		if bom.project != project or bom.company != p.company or bom.docstatus != 1 or not bom.is_active:
			frappe.throw("Select an active submitted BOM for this project and company.")
		if not math.isfinite(flt(qty)) or flt(qty) <= 0:
			frappe.throw("Production quantity must be positive.")
		plan.append(
			"po_items",
			{
				"item_code": bom.item,
				"bom_no": bom.name,
				"planned_qty": flt(qty),
				"stock_uom": bom.uom,
				"include_exploded_items": 1,
			},
		)
	elif source in ("Sales Order", "Material Request"):
		doc = readable(source, source_name)
		if doc.company != p.company or doc.docstatus != 1:
			frappe.throw("Select a submitted source in the project company.")
		if source == "Sales Order":
			if doc.project != project:
				frappe.throw("Sales Order does not belong to this project.")
			plan.append("sales_orders", {"sales_order": doc.name})
		else:
			if doc.material_request_type != "Manufacture" or not any(i.project == project for i in doc.items):
				frappe.throw("Select a Manufacture request for this project.")
			plan.get_items_from = source
			plan.append("material_requests", {"material_request": doc.name})
		plan.get_items()
		if source == "Material Request":
			allowed = {i.name for i in doc.items if i.project == project}
			plan.set("po_items", [i for i in plan.po_items if i.material_request_item in allowed])
	else:
		frappe.throw("Unknown production source.")
	if not plan.po_items:
		frappe.throw("No outstanding production items with a BOM were found.")
	for row in plan.po_items:
		bom = readable("BOM", row.bom_no)
		if bom.company != p.company or bom.docstatus != 1 or not bom.is_active:
			frappe.throw("All production items need active submitted BOMs in the project company.")
		row.warehouse = fg_warehouse
		row.planned_start_date = planned_start
		row.include_exploded_items = 1
	# Native calculator supplies stock UOM, full requirement and warehouse availability.
	frappe.has_permission("Item", "read", throw=True)
	frappe.has_permission("Bin", "read", throw=True)
	plan.set("mr_items", get_items_for_material_requests(plan.as_dict()))
	return plan.as_dict()


def make_orders(plan_name, source_warehouse, wip_warehouse, fg_warehouse):
	"""Create native draft orders under plan lock; never submit or ignore permissions."""
	plan = readable("Production Plan", plan_name)
	plan.check_permission("write")
	frappe.has_permission("Work Order", "create", throw=True)
	readable("Project", plan.project)
	if plan.docstatus != 1:
		frappe.throw("Submit the production plan before creating work orders.")
	for name in (source_warehouse, wip_warehouse, fg_warehouse):
		warehouse(name, plan.company)
	if source_warehouse == wip_warehouse or fg_warehouse == wip_warehouse:
		frappe.throw("WIP must differ from source and finished goods warehouses.")
	# Native make_work_order calculates remaining ordered_qty. Lock and reload to serialize retries.
	frappe.db.get_value("Production Plan", plan.name, "name", for_update=True)
	plan.reload()
	if plan.docstatus != 1:
		frappe.throw("Submit the production plan before creating work orders.")
	before = set(
		frappe.get_list(
			"Work Order", filters={"production_plan": plan.name}, pluck="name", limit_page_length=0
		)
	)
	# MR-backed native planning does not subtract existing draft orders. Refuse repeat generation.
	if frappe.db.exists("Work Order", {"production_plan": plan.name, "docstatus": ["!=", 2]}):
		frappe.throw("This plan already has work orders. Review those orders before planning another batch.")
	plan.make_work_order()
	created = []
	for name in frappe.get_list(
		"Work Order", filters={"production_plan": plan.name}, pluck="name", limit_page_length=0
	):
		if name in before:
			continue
		wo = readable("Work Order", name)
		wo.source_warehouse = source_warehouse
		wo.wip_warehouse = wip_warehouse
		wo.fg_warehouse = fg_warehouse
		wo.skip_transfer = 0
		wo.transfer_material_against = "Work Order"
		for row in wo.required_items:
			row.source_warehouse = source_warehouse
		# Clear the native planner's creation-only validation bypass flags before saving.
		wo.flags.ignore_validate = False
		wo.flags.ignore_mandatory = False
		wo.save()
		created.append(name)
	return created


def prepare_transfer(work_order):
	"""Permission-check the native stock mapper, which does not enforce source read access."""
	from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry

	wo = readable("Work Order", work_order)
	frappe.has_permission("Stock Entry", "create", throw=True)
	if wo.docstatus != 1 or wo.status in ("Stopped", "Closed", "Completed") or wo.skip_transfer:
		frappe.throw("Select a submitted active work order requiring material transfer.")
	qty = flt(wo.qty) - flt(wo.material_transferred_for_manufacturing)
	if qty <= 0:
		frappe.throw("All planned material has already been transferred.")
	existing = frappe.get_list(
		"Stock Entry",
		filters={
			"work_order": wo.name,
			"docstatus": 0,
			"stock_entry_type": "Material Transfer for Manufacture",
		},
		fields=["name"],
		limit_page_length=1,
	)
	if existing:
		return {"existing_name": existing[0].name}
	# Return a draft for review, tracking allocation and normal Stock Entry submission.
	return make_stock_entry(wo.name, "Material Transfer for Manufacture", qty=qty)


def start_job(args):
	"""Start a project job and transfer remaining raw materials in the same transaction.

	Tracking allocations and stock workflows require a reviewed transfer first.
	Native validation failures roll back both the transfer and the job start.
	"""
	from erpnext.manufacturing.doctype.job_card.job_card import make_time_log
	from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
	from frappe.model.workflow import get_workflow_name

	args = frappe._dict(frappe.parse_json(args))
	if args.status not in ("Work In Progress", "Resume Job"):
		frappe.throw("Only start and resume are supported.")
	card = readable("Job Card", args.job_card_id)
	card.check_permission("write")
	if card.status in ("Work In Progress", "Completed", "Cancelled"):
		frappe.throw("This job is already running or finished.")
	if card.work_order:
		wo = readable("Work Order", card.work_order)
		if wo.project and wo.production_plan and not wo.skip_transfer:
			readable("Project", wo.project)
			frappe.db.get_value("Work Order", wo.name, "name", for_update=True)
			wo.reload()
			if wo.docstatus != 1 or wo.status in ("Stopped", "Closed", "Completed"):
				frappe.throw("The work order must be submitted and active before starting a job.")
			remaining = flt(wo.qty) - flt(wo.material_transferred_for_manufacturing)
			if remaining > 0 and wo.required_items:
				if wo.transfer_material_against != "Work Order":
					frappe.throw("Transfer materials against the Job Card before starting it.")
				frappe.has_permission("Stock Entry", "create", throw=True)
				frappe.has_permission("Stock Entry", "submit", throw=True)
				if get_workflow_name("Stock Entry"):
					frappe.throw("Complete the material transfer approval workflow before starting the job.")
				if frappe.db.exists(
					"Stock Entry",
					{
						"work_order": wo.name,
						"docstatus": 0,
						"stock_entry_type": "Material Transfer for Manufacture",
					},
				):
					frappe.throw("Review and submit the existing WIP transfer draft before starting the job.")
				stock = frappe.get_doc(
					make_stock_entry(wo.name, "Material Transfer for Manufacture", qty=remaining)
				)
				for row in stock.items:
					item = readable("Item", row.item_code)
					if item.has_serial_no or item.has_batch_no:
						frappe.throw(
							"Prepare and submit the WIP transfer with serial/batch allocations before starting."
						)
				stock.insert()
				stock.submit()
	frappe.db.get_value("Job Card", card.name, "name", for_update=True)
	card.reload()
	if card.status in ("Work In Progress", "Completed", "Cancelled"):
		frappe.throw("This job is already running or finished.")
	# The native method validates operation sequence and updates time logs/status.
	return make_time_log(args)
