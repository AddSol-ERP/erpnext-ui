"""Optional operation approval snapshots and server-side job card enforcement."""

import frappe
from erpnext.manufacturing.doctype.job_card.job_card import JobCard
from frappe.utils import now_datetime

from erpnext_ui.operation_approval_rules import RULE_FIELDS, AUDIT_FIELDS, assert_allowed, work_recorded


class ApprovalJobCard(JobCard):
	def before_insert(self):
		# Never accept approval state or configuration supplied by the client.
		self.set("custom_approval_rules", [])
		for field in (*RULE_FIELDS, *AUDIT_FIELDS):
			self.set(field, None)
		if self.work_order and self.operation_id:
			work_order = frappe.get_doc("Work Order", self.work_order)
			for rule in work_order.get("custom_approval_rules") or []:
				if rule.get("operation_row") == self.operation_id:
					self.append("custom_approval_rules", {key: rule.get(key) for key in (
						"operation", "operation_row", "approval_point", "perspective", "instruction",
						"instruction_snapshot", "approval_role", "note")})
			row = frappe.db.get_value("Work Order Operation", {"name": self.operation_id, "parent": self.work_order}, list(RULE_FIELDS), as_dict=True)
			if row:
				for field in RULE_FIELDS:
					self.set(field, row.get(field))

	def validate(self):
		old = self.get_doc_before_save()
		if not old and self.get("time_logs"):
			assert_allowed(self, "start")
			if any(float(row.get("completed_qty") or 0) > 0 for row in self.time_logs):
				assert_allowed(self, "complete")
		if not old and int(self.docstatus or 0) == 1:
			assert_allowed(self, "release")
		if old:
			if any(row.get("approval_point") == "After Work" and row.get("approved_by") for row in old.get("custom_approval_rules") or []):
				log_fields = ("name", "from_time", "to_time", "completed_qty", "operation", "employee")
				if [tuple(row.get(field) for field in log_fields) for row in self.get("time_logs") or []] != [tuple(row.get(field) for field in log_fields) for row in old.get("time_logs") or []] or self.get("process_loss_qty") != old.get("process_loss_qty"):
					frappe.throw("Work records cannot be changed after an after-work approval.")
			fields = ("name", "operation", "operation_row", "approval_point", "perspective", "instruction", "instruction_snapshot", "approval_role", "note", "approved_by", "approved_at")
			if [tuple(row.get(field) for field in fields) for row in self.get("custom_approval_rules") or []] != [tuple(row.get(field) for field in fields) for row in old.get("custom_approval_rules") or []]:
				frappe.throw("Job card approval rules cannot be changed directly.")
			for field in (*RULE_FIELDS, *AUDIT_FIELDS, "work_order", "operation_id"):
				if self.get(field) != old.get(field):
					frappe.throw("Job card approval and operation identity cannot be changed directly.")
			if not old.get(AUDIT_FIELDS[0]) or old.get("custom_approval_rules"):
				if self.status == "Work In Progress" and self.status != old.status:
					assert_allowed(old, "start")
				if old.get(RULE_FIELDS[0]) == "Before Start" and [r.as_dict() for r in self.get("time_logs") or []] != [r.as_dict() for r in old.get("time_logs") or []]:
					assert_allowed(old, "start")
				if self.status in ("Complete", "Completed") and self.status != old.status:
					assert_allowed(old, "complete")
				old_logs = {row.name: row for row in old.get("time_logs") or []}
				for row in self.get("time_logs") or []:
					previous = old_logs.get(row.name)
					if not previous and row.get("from_time"):
						assert_allowed(old, "start")
					old_qty = float(previous.get("completed_qty") or 0) if previous else 0
					if float(row.get("completed_qty") or 0) > old_qty:
						assert_allowed(old, "complete")
				if int(self.docstatus or 0) == 1 and int(old.docstatus or 0) == 0:
					assert_allowed(old, "complete")
					assert_allowed(old, "release")
		super().validate()


def approve_job_card(name, rule_name=None):
	card = frappe.get_doc("Job Card", name)
	card.check_permission("read")
	frappe.db.get_value("Job Card", name, "name", for_update=True)
	card.reload()
	if card.docstatus == 2 or card.status in ("Completed", "Cancelled"):
		frappe.throw("This job card is already finished or cancelled.")
	if rule_name:
		rule = next((row for row in card.get("custom_approval_rules") or [] if row.name == rule_name), None)
		if not rule:
			frappe.throw("Approval rule not found on this job card.")
		if rule.get("approved_by"):
			frappe.throw("This approval rule has already been approved.")
		if rule.get("approval_role") not in frappe.get_roles(frappe.session.user):
			frappe.throw("You do not have the role required to approve this operation.", frappe.PermissionError)
		if rule.get("approval_point") == "After Work":
			if not work_recorded(card):
				frappe.throw("Record and finish the work before approving this rule.")
		frappe.db.set_value("UI Operation Approval Rule", rule.name, {"approved_by": frappe.session.user, "approved_at": now_datetime()})
		return {"approved_by": frappe.session.user}
	if not card.get(RULE_FIELDS[0]):
		frappe.throw("This operation has no approval requirement.")
	if card.get(AUDIT_FIELDS[0]):
		frappe.throw("This operation has already been approved.")
	if card.get(RULE_FIELDS[1]) not in frappe.get_roles(frappe.session.user):
		frappe.throw("You do not have the role required to approve this operation.", frappe.PermissionError)
	frappe.db.set_value("Job Card", name, {AUDIT_FIELDS[0]: frappe.session.user, AUDIT_FIELDS[1]: now_datetime()})
	return {"approved_by": frappe.session.user}


def release_job_card(name):
	card = frappe.get_doc("Job Card", name)
	card.check_permission("submit")
	frappe.db.get_value("Job Card", name, "name", for_update=True)
	card.reload()
	assert_allowed(card, "complete")
	assert_allowed(card, "release")
	card.submit()
	return {"name": card.name}
