"""Apply optional operation start preferences before ERPNext schedules job cards."""

from datetime import timedelta

import frappe
from erpnext.manufacturing.doctype.work_order.work_order import WorkOrder
from frappe.utils import get_datetime


class PreferredScheduleWorkOrder(WorkOrder):
	def validate(self):
		super().validate()
		from erpnext_ui.operation_approval_rules import validate_rules
		validate_rules(self)
		for row in self.operations:
			start, end = row.get("custom_preferred_start"), row.get("custom_preferred_end")
			if start and end and get_datetime(end) <= get_datetime(start):
				frappe.throw(f"Row {row.idx}: preferred end must be after preferred start.")

	def set_work_order_operations(self):
		super().set_work_order_operations()
		from frappe.model.naming import set_new_name
		from erpnext_ui.operation_approval_rules import COPY_FIELDS, RULE_FIELDS
		# Native mapping preserves each source BOM and operation order, including
		# repeated operations and multi-level BOMs, but omits custom fields.
		by_bom = {}
		bom_rules = {}
		self.set("custom_approval_rules", [])
		for row in self.operations:
			bom = row.get("bom") or self.bom_no
			if bom not in by_bom:
				by_bom[bom] = iter(frappe.get_all("BOM Operation", filters={"parent": bom}, fields=["name", *RULE_FIELDS], order_by="idx"))
				bom_rules[bom] = frappe.get_doc("BOM", bom).get("custom_approval_rules") or []
			source = next(by_bom[bom], None)
			if source:
				for field in RULE_FIELDS:
					row.set(field, source.get(field))
				if not row.name:
					set_new_name(row)
				for rule in bom_rules[bom]:
					if rule.get("operation_row") == source.name:
						values = {field: rule.get(field) for field in COPY_FIELDS}
						values.update(operation=row.operation, operation_row=row.name)
						self.append("custom_approval_rules", values)

	def set_operation_start_end_time(self, row, idx):
		super().set_operation_start_end_time(row, idx)
		preferred = row.get("custom_preferred_start")
		if preferred and get_datetime(preferred) > get_datetime(row.planned_start_time):
			row.planned_start_time = get_datetime(preferred)
			row.planned_end_time = row.planned_start_time + timedelta(minutes=float(row.time_in_mins))

	def prepare_data_for_job_card(self, row, idx, plan_days, enable_capacity_planning):
		result = super().prepare_data_for_job_card(row, idx, plan_days, enable_capacity_planning)
		preferred_end = row.get("custom_preferred_end")
		if preferred_end and row.planned_end_time and get_datetime(row.planned_end_time) > get_datetime(preferred_end):
			frappe.msgprint(f"Operation {row.operation} is scheduled after its preferred end time.", alert=True)
		return result
