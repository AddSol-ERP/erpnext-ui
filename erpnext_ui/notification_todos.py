"""Create idempotent ToDo tasks from matched standard Notification rules."""

import hashlib
import json

import frappe
from frappe import _
from frappe.email.doctype.notification.notification import Notification as CoreNotification
from frappe.email.doctype.notification.notification import get_context
from frappe.utils import add_days, cint, getdate, nowdate
from frappe.utils.jinja import validate_template


class NotificationWithTodos(CoreNotification):
	"""Extend the core Notification send path without replacing its channels."""

	def validate(self):
		super().validate()
		if self.get("custom_create_todo"):
			self.validate_todo_settings()

	def validate_todo_settings(self):
		template = self.get("custom_todo_description_template")
		if not template:
			frappe.throw(_("To-Do Description Template is required when Create To-Do is enabled."))
		validate_template(template)

		assignment_type = self.get("custom_todo_assignment_type")
		if assignment_type == "Specific User":
			if not self.get("custom_todo_user"):
				frappe.throw(_("Select the User who should receive this To-Do."))
		elif assignment_type == "User Field":
			fieldname = self.get("custom_todo_user_field")
			field = frappe.get_meta(self.document_type).get_field(fieldname) if fieldname else None
			if fieldname not in ("owner", "modified_by") and not (
				field and field.fieldtype == "Link" and field.options == "User"
			):
				frappe.throw(
					_("User Fieldname must be a Link field to User on the selected Document Type.")
				)
		elif assignment_type == "Role":
			if not self.get("custom_todo_role"):
				frappe.throw(_("Select the Role whose enabled users should receive this To-Do."))
		else:
			frappe.throw(_("Select Specific User, User Field, or Role for To-Do assignment."))

		date_fieldname = self.get("custom_todo_due_date_field")
		if date_fieldname:
			field = frappe.get_meta(self.document_type).get_field(date_fieldname)
			if date_fieldname not in ("creation", "modified") and not (
				field and field.fieldtype in ("Date", "Datetime")
			):
				frappe.throw(
					_("Due Date Fieldname must be a Date or Datetime field on the selected Document Type.")
				)

		if self.get("custom_todo_priority") not in ("High", "Medium", "Low"):
			frappe.throw(_("Select a valid To-Do Priority."))

	def send(self, doc):
		# Preserve email, SMS, Slack, system notifications, and post-alert property updates.
		super().send(doc)
		if self.get("custom_create_todo"):
			self.create_notification_todos(doc)

	def create_notification_todos(self, doc):
		try:
			assignees = self.get_todo_assignees(doc)
			if not assignees:
				return

			context = get_context(doc)
			context["alert"] = self
			description = frappe.render_template(
				self.custom_todo_description_template,
				context,
			).strip()
			if not description:
				return

			due_date = self.get_todo_due_date(doc)
			assigned_by = frappe.session.user
			if assigned_by == "Guest":
				assigned_by = doc.get("owner") or "Administrator"

			for assignee in assignees:
				try:
					# Assignment rules can name users who are not allowed to read the
					# source document. Check as the target user before creating or refreshing
					# a ToDo, or its description/reference can disclose restricted data.
					if not self.assignee_can_read_source(doc, assignee):
						self.log_skipped_assignee(doc, assignee)
						continue

					self.upsert_notification_todo(
						doc=doc,
						assignee=assignee,
						assigned_by=assigned_by,
						description=description,
						due_date=due_date,
					)
				except Exception:
					# A task rule must not roll back the source document action or its other alerts.
					frappe.log_error(
						title=_("To-Do Creation Failed for Notification {0}").format(self.name),
						message=frappe.get_traceback(),
					)
		except Exception:
			# Keep task generation isolated from the transaction that triggered the alert.
			frappe.log_error(
				title=_("To-Do Creation Failed for Notification {0}").format(self.name),
				message=frappe.get_traceback(),
			)

	def log_skipped_assignee(self, doc, assignee):
		"""Record denied assignments in Error Log for Administrator review."""
		frappe.log_error(
			title=_("Notification To-Do Skipped: No Source Access"),
			message=(
				f"Notification: {self.name}\n"
				f"Assignee: {assignee}\n"
				f"Source document: {doc.doctype} {doc.name}\n"
				"Reason: The assignee does not have read permission for the source document."
			),
		)

	def assignee_can_read_source(self, doc, assignee):
		"""Fail closed unless the resolved assignee can read the triggering document."""
		try:
			return bool(frappe.has_permission(doc=doc, ptype="read", user=assignee))
		except Exception:
			# Permission-check failures must never fall through to task creation.
			frappe.log_error(
				title=_("To-Do Access Check Failed for Notification {0}").format(self.name),
				message=frappe.get_traceback(),
			)
			return False

	def get_todo_assignees(self, doc):
		assignment_type = self.custom_todo_assignment_type
		if assignment_type == "Specific User":
			candidates = [self.custom_todo_user]
		elif assignment_type == "User Field":
			candidates = [doc.get(self.custom_todo_user_field)]
		else:
			candidates = frappe.get_all(
				"Has Role",
				filters={"parenttype": "User", "role": self.custom_todo_role},
				pluck="parent",
				ignore_permissions=True,
			)

		candidates = list(dict.fromkeys(user for user in candidates if user))
		if not candidates:
			return []
		return frappe.get_all(
			"User",
			filters={"name": ("in", candidates), "enabled": 1},
			pluck="name",
			order_by="name asc",
			ignore_permissions=True,
		)

	def get_todo_due_date(self, doc):
		fieldname = self.get("custom_todo_due_date_field")
		value = doc.get(fieldname) if fieldname else None
		base_date = getdate(value) if value else getdate(nowdate())
		return add_days(base_date, cint(self.get("custom_todo_due_days")))

	def upsert_notification_todo(self, doc, assignee, assigned_by, description, due_date):
		key_payload = [self.name, doc.doctype, doc.name, assignee]
		task_key = hashlib.sha256(
			json.dumps(key_payload, ensure_ascii=False, separators=(",", ":")).encode()
		).hexdigest()
		existing_name = frappe.db.get_value(
			"ToDo", {"custom_notification_task_key": task_key}, "name"
		)
		if existing_name:
			todo = frappe.get_doc("ToDo", existing_name)
			# Repeated Save/Value Change events refresh one open task. A completed or
			# cancelled task remains terminal, so later saves cannot recreate it.
			if todo.status == "Open":
				self.apply_todo_values(todo, description, due_date)
				todo.save(ignore_permissions=True)
			return

		todo = frappe.get_doc(
			{
				"doctype": "ToDo",
				"allocated_to": assignee,
				"assigned_by": assigned_by,
				"reference_type": doc.doctype,
				"reference_name": doc.name,
				"status": "Open",
				"custom_generated_by_notification": self.name,
				"custom_notification_task_key": task_key,
			}
		)
		self.apply_todo_values(todo, description, due_date)
		todo.insert(ignore_permissions=True)

	def apply_todo_values(self, todo, description, due_date):
		todo.description = description
		todo.date = due_date
		todo.priority = self.custom_todo_priority or "Medium"
		todo.color = self.get("custom_todo_color") or ""
		todo.custom_for_information_only = cint(self.get("custom_todo_for_information_only"))
