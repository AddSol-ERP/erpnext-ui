"""Permission and project isolation checks without a running bench."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

frappe = types.ModuleType("frappe")
frappe.throw = Mock(side_effect=lambda message: (_ for _ in ()).throw(ValueError(message)))
frappe.has_permission = Mock(return_value=True)
frappe.get_doc = Mock()
frappe.get_list = Mock(return_value=[])
frappe.new_doc = Mock()
frappe.db = Mock()
utils = types.ModuleType("frappe.utils")
utils.flt = lambda value: float(value or 0)
planner = types.ModuleType("erpnext.manufacturing.doctype.production_plan.production_plan")
planner.get_items_for_material_requests = Mock(return_value=[{"item_code": "RAW", "required_bom_qty": 6}])
mapper = types.ModuleType("erpnext.manufacturing.doctype.work_order.work_order")
mapper.make_stock_entry = Mock(return_value={"doctype": "Stock Entry"})
spec = importlib.util.spec_from_file_location(
	"manufacturing_under_test", Path(__file__).resolve().parents[1] / "erpnext_ui/manufacturing.py"
)
manufacturing = importlib.util.module_from_spec(spec)
modules = {"frappe": frappe, "frappe.utils": utils, planner.__name__: planner, mapper.__name__: mapper}
with patch.dict(sys.modules, modules):
	spec.loader.exec_module(manufacturing)


class Doc(dict):
	def __getattr__(self, key):
		return self.get(key)

	__setattr__ = dict.__setitem__

	def check_permission(self, permission):
		if self.get("deny"):
			raise PermissionError(permission)

	def append(self, key, value):
		self.setdefault(key, []).append(Doc(value))

	def set(self, key, value):
		self[key] = value

	def as_dict(self):
		return dict(self)


class ManufacturingTests(unittest.TestCase):
	def setUp(self):
		self.project = Doc(name="P1", company="C1")
		self.bom = Doc(name="B1", project="P1", company="C1", docstatus=1, is_active=1, item="FG", uom="Nos")
		self.plan = Doc(po_items=[])
		self.wo = Doc(
			name="WO1",
			company="C1",
			docstatus=1,
			status="Not Started",
			qty=10,
			material_transferred_for_manufacturing=4,
			skip_transfer=0,
		)
		frappe.get_doc.side_effect = lambda dt, name: {
			"Project": self.project,
			"BOM": self.bom,
			"Warehouse": Doc(company="C1", is_group=0, disabled=0),
			"Work Order": self.wo,
		}[dt]
		frappe.new_doc.return_value = self.plan
		frappe.get_list.return_value = []
		frappe.db.exists.return_value = False
		mapper.make_stock_entry.reset_mock()
		self.modules = patch.dict(sys.modules, modules)
		self.modules.start()
		self.addCleanup(self.modules.stop)

	def preview(self, **kwargs):
		return manufacturing.prepare_plan(
			"P1", kwargs.get("source", "BOM"), "B1", kwargs.get("qty", 2), "RAW", "FG", "2026-11-17 10:00:00"
		)

	def test_bom_preview_scales_finished_quantity_and_includes_raw_requirements(self):
		result = self.preview()
		self.assertEqual(result["po_items"][0].planned_qty, 2)
		self.assertEqual(result["po_items"][0].warehouse, "FG")
		self.assertEqual(result["mr_items"][0]["required_bom_qty"], 6)

	def test_other_project_bom_rejected(self):
		self.bom.project = "P2"
		with self.assertRaisesRegex(ValueError, "this project"):
			self.preview()

	def test_unsubmitted_bom_rejected(self):
		self.bom.docstatus = 0
		with self.assertRaises(ValueError):
			self.preview()

	def test_zero_quantity_rejected(self):
		with self.assertRaisesRegex(ValueError, "positive"):
			self.preview(qty=0)

	def test_document_read_permission_is_enforced(self):
		self.project.deny = True
		with self.assertRaises(PermissionError):
			self.preview()

	def test_warehouse_company_is_enforced(self):
		with patch.object(manufacturing, "readable", return_value=Doc(company="C2")):
			with self.assertRaisesRegex(ValueError, "company"):
				manufacturing.warehouse("OTHER", "C1")

	def test_transfer_only_maps_remaining_production_quantity(self):
		manufacturing.prepare_transfer("WO1")
		mapper.make_stock_entry.assert_called_once_with("WO1", "Material Transfer for Manufacture", qty=6)

	def test_completed_transfer_cannot_be_repeated(self):
		self.wo.material_transferred_for_manufacturing = 10
		with self.assertRaisesRegex(ValueError, "already been transferred"):
			manufacturing.prepare_transfer("WO1")
		mapper.make_stock_entry.assert_not_called()

	def test_draft_order_cannot_transfer(self):
		self.wo.docstatus = 0
		with self.assertRaisesRegex(ValueError, "submitted"):
			manufacturing.prepare_transfer("WO1")

	def test_existing_transfer_draft_is_resumed(self):
		frappe.get_list.return_value = [Doc(name="STE-DRAFT")]
		self.assertEqual(manufacturing.prepare_transfer("WO1"), {"existing_name": "STE-DRAFT"})
		mapper.make_stock_entry.assert_not_called()

	def test_work_order_creation_requires_submitted_plan(self):
		plan = Doc(name="PLAN1", project="P1", company="C1", docstatus=0)
		with patch.object(manufacturing, "readable", return_value=plan):
			with self.assertRaisesRegex(ValueError, "Submit"):
				manufacturing.make_orders("PLAN1", "RAW", "WIP", "FG")

	def test_existing_plan_orders_cannot_be_generated_again(self):
		plan = Doc(
			name="PLAN1", project="P1", company="C1", docstatus=1, reload=Mock(), make_work_order=Mock()
		)
		frappe.db.exists.return_value = True
		with (
			patch.object(manufacturing, "readable", return_value=plan),
			patch.object(manufacturing, "warehouse"),
		):
			with self.assertRaisesRegex(ValueError, "already has work orders"):
				manufacturing.make_orders("PLAN1", "RAW", "WIP", "FG")
		plan.make_work_order.assert_not_called()

	def test_wip_cannot_equal_source_warehouse(self):
		plan = Doc(name="PLAN1", project="P1", company="C1", docstatus=1)
		with (
			patch.object(manufacturing, "readable", return_value=plan),
			patch.object(manufacturing, "warehouse"),
		):
			with self.assertRaisesRegex(ValueError, "WIP must differ"):
				manufacturing.make_orders("PLAN1", "RAW", "RAW", "FG")


class ProjectJobStartTests(unittest.TestCase):
	def setUp(self):
		self.card = Doc(name="JC1", work_order="WO1", status="Open", reload=Mock())
		self.wo = Doc(
			name="WO1",
			project="P1",
			production_plan="PLAN1",
			skip_transfer=0,
			docstatus=1,
			status="Not Started",
			qty=10,
			material_transferred_for_manufacturing=0,
			required_items=[Doc(item_code="RAW")],
			transfer_material_against="Work Order",
			reload=Mock(),
		)
		self.stock = types.SimpleNamespace(items=[Doc(item_code="RAW")], insert=Mock(), submit=Mock())
		self.item = Doc(has_serial_no=0, has_batch_no=0)
		self.workflow = types.ModuleType("frappe.model.workflow")
		self.workflow.get_workflow_name = Mock(return_value=None)
		self.job_module = types.ModuleType("erpnext.manufacturing.doctype.job_card.job_card")
		self.job_module.make_time_log = Mock()
		frappe._dict = Doc
		frappe.parse_json = lambda value: value
		frappe.get_doc.side_effect = lambda dt, name=None: (
			self.stock
			if isinstance(dt, dict)
			else {"Job Card": self.card, "Work Order": self.wo, "Project": Doc(), "Item": self.item}[dt]
		)
		frappe.db.exists.return_value = False
		frappe.has_permission.side_effect = None
		self.context = patch.dict(
			sys.modules,
			{**modules, self.workflow.__name__: self.workflow, self.job_module.__name__: self.job_module},
		)
		self.context.start()
		self.addCleanup(self.context.stop)

	def start(self):
		manufacturing.start_job({"job_card_id": "JC1", "status": "Work In Progress"})

	def test_transfer_is_submitted_before_start(self):
		events = []
		self.stock.submit.side_effect = lambda: events.append("transfer")
		self.job_module.make_time_log.side_effect = lambda args: events.append("start")
		self.start()
		self.assertEqual(events, ["transfer", "start"])

	def test_tracking_requires_review_before_start(self):
		self.item.has_batch_no = 1
		with self.assertRaisesRegex(ValueError, "serial/batch"):
			self.start()
		self.stock.submit.assert_not_called()
		self.job_module.make_time_log.assert_not_called()

	def test_workflow_is_never_bypassed(self):
		self.workflow.get_workflow_name.return_value = "Stock approval"
		with self.assertRaisesRegex(ValueError, "approval workflow"):
			self.start()
		self.job_module.make_time_log.assert_not_called()

	def test_insufficient_stock_does_not_start_job(self):
		self.stock.submit.side_effect = ValueError("Insufficient stock")
		with self.assertRaisesRegex(ValueError, "Insufficient stock"):
			self.start()
		self.job_module.make_time_log.assert_not_called()

	def test_already_transferred_order_is_not_transferred_again(self):
		self.wo.material_transferred_for_manufacturing = 10
		self.start()
		self.stock.insert.assert_not_called()
		self.job_module.make_time_log.assert_called_once()

	def test_running_job_cannot_start_again(self):
		self.card.status = "Work In Progress"
		with self.assertRaisesRegex(ValueError, "already running"):
			self.start()
		self.stock.insert.assert_not_called()

	def test_stock_submission_permission_is_required(self):
		def authorize(doctype, permission, **kwargs):
			if doctype == "Stock Entry" and permission == "submit":
				raise PermissionError("Stock Entry submit denied")
			return True

		with patch.object(frappe, "has_permission", side_effect=authorize):
			with self.assertRaises(PermissionError):
				self.start()
		self.stock.submit.assert_not_called()
		self.job_module.make_time_log.assert_not_called()


if __name__ == "__main__":
	unittest.main()
