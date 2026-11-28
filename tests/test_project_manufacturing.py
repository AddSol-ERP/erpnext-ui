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

	def test_warehouse_defaults_only_include_accessible_active_company_leaves(self):
		values = {"default_warehouse": "RAW", "default_wip_warehouse": "WIP", "default_fg_warehouse": "FG"}
		rows = {"RAW": Doc(company="C1", is_group=0, disabled=0), "WIP": Doc(company="C1", is_group=0, disabled=0), "FG": Doc(company="OTHER", is_group=0, disabled=0)}
		with patch.object(frappe.db, "get_single_value", side_effect=lambda dt, field: values[field]), patch.object(frappe.db, "get_value", side_effect=lambda dt, name, fields, as_dict: rows[name]), patch.object(frappe, "has_permission", side_effect=lambda dt, action, name: name != "WIP"):
			self.assertEqual(manufacturing.warehouse_defaults("C1"), {"source": "RAW", "wip": "", "fg": ""})

	def test_warehouse_defaults_reject_groups_and_disabled(self):
		values = {"default_warehouse": "GROUP", "default_wip_warehouse": "DISABLED", "default_fg_warehouse": "FG"}
		rows = {"GROUP": Doc(company="C1", is_group=1, disabled=0), "DISABLED": Doc(company="C1", is_group=0, disabled=1), "FG": Doc(company="C1", is_group=0, disabled=0)}
		with patch.object(frappe.db, "get_single_value", side_effect=lambda dt, field: values[field]), patch.object(frappe.db, "get_value", side_effect=lambda dt, name, fields, as_dict: rows[name]), patch.object(frappe, "has_permission", return_value=True):
			self.assertEqual(manufacturing.warehouse_defaults("C1"), {"source": "", "wip": "", "fg": "FG"})

	def test_workspace_lists_cancelled_orders_only_in_complete_project_list(self):
		orders = {"WO1": Doc(name="WO1", docstatus=1), "WO2": Doc(name="WO2", docstatus=2)}
		original = frappe.get_doc.side_effect
		frappe.get_doc.side_effect = lambda dt, name: orders[name] if dt == "Work Order" else original(dt, name)
		def get_list(doctype, filters=None, **kwargs):
			if doctype != "Work Order":
				return []
			return [Doc(name="WO1")] if "docstatus" in filters else [Doc(name="WO1"), Doc(name="WO2")]
		frappe.get_list.side_effect = get_list
		self.addCleanup(lambda: setattr(frappe.get_list, "side_effect", None))
		result = manufacturing.workspace("P1")
		self.assertEqual([row["name"] for row in result["work_orders"]], ["WO1"])
		self.assertEqual([row["name"] for row in result["all_work_orders"]], ["WO1", "WO2"])

	def test_multiple_boms_are_rejected(self):
		with patch.object(frappe, "parse_json", lambda value: value, create=True):
			with self.assertRaisesRegex(ValueError, "only one BOM"):
				manufacturing.prepare_plan("P1", "BOM", None, 1, "RAW", "FG", "2026-11-17",
					[{"bom": "B1", "qty": 2}, {"bom": "B2", "qty": 3}])

	def test_duplicate_bom_is_rejected(self):
		with patch.object(frappe, "parse_json", lambda value: value, create=True):
			with self.assertRaisesRegex(ValueError, "only one BOM"):
				manufacturing.prepare_plan("P1", "BOM", None, 1, "RAW", "FG", "2026-11-17",
					[{"bom": "B1", "qty": 1}, {"bom": "B1", "qty": 2}])

	def test_request_with_multiple_boms_is_rejected(self):
		items = [Doc(name="ROW1", project="P1", qty=1, ordered_qty=0, conversion_factor=1),
			Doc(name="ROW2", project="P1", qty=1, ordered_qty=0, conversion_factor=1)]
		request = types.SimpleNamespace(name="MR1", company="C1", docstatus=1,
			material_request_type="Manufacture", items=items, check_permission=Mock())
		original = frappe.get_doc.side_effect
		frappe.get_doc.side_effect = lambda dt, name: request if dt == "Material Request" else original(dt, name)
		self.plan.get_items = Mock(side_effect=lambda: self.plan.po_items.extend([
			Doc(material_request_item="ROW1", bom_no="B1"), Doc(material_request_item="ROW2", bom_no="B2")]))
		with self.assertRaisesRegex(ValueError, "only one BOM"):
			manufacturing.prepare_plan("P1", "Material Request", "MR1", 1, "RAW", "FG", "2026-11-17")

	def test_other_project_bom_rejected(self):
		self.bom.project = "P2"
		with self.assertRaisesRegex(ValueError, "project"):
			self.preview()

	def test_other_company_bom_rejected(self):
		self.bom.company = "C2"
		with self.assertRaisesRegex(ValueError, "company"):
			self.preview()

	def test_unsubmitted_bom_rejected(self):
		self.bom.docstatus = 0
		with self.assertRaises(ValueError):
			self.preview()

	def test_zero_quantity_rejected(self):
		with self.assertRaisesRegex(ValueError, "positive"):
			self.preview(qty=0)

	def test_material_request_uses_unique_project_bom_when_native_mapper_skips_item(self):
		item = Doc(name="MRI1", project="P1", item_code="FG", qty=5, ordered_qty=2,
			conversion_factor=2, warehouse="FG", description="Finished item")
		request = types.SimpleNamespace(name="MR1", company="C1", docstatus=1,
			material_request_type="Manufacture", items=[item], check_permission=Mock())
		original_get_doc = frappe.get_doc.side_effect
		frappe.get_doc.side_effect = lambda dt, name: request if dt == "Material Request" else original_get_doc(dt, name)
		frappe.get_list.return_value = [Doc(name="B1")]
		frappe._dict = Doc
		self.plan.get_items = Mock()
		self.plan.add_items = Mock(side_effect=lambda rows: self.plan.po_items.extend(
			Doc(material_request_item=row.name, bom_no=row.bom_no) for row in rows
		))
		self.plan.calculate_total_planned_qty = Mock()
		result = manufacturing.prepare_plan("P1", "Material Request", "MR1", 1, "RAW", "FG", "2026-11-17")
		row = self.plan.add_items.call_args.args[0][0]
		self.assertEqual((row.name, row.bom_no, row.pending_qty), ("MRI1", "B1", 6))
		self.assertEqual(result["po_items"][0].material_request_item, "MRI1")

	def test_request_preview_uses_selected_line_and_quantity(self):
		items = [Doc(name="ROW1", project="P1", qty=5, ordered_qty=1, conversion_factor=2),
			Doc(name="ROW2", project="P1", qty=3, ordered_qty=0, conversion_factor=1)]
		request = types.SimpleNamespace(name="MR1", company="C1", docstatus=1,
			material_request_type="Manufacture", items=items, check_permission=Mock())
		original = frappe.get_doc.side_effect
		frappe.get_doc.side_effect = lambda dt, name: request if dt == "Material Request" else original(dt, name)
		self.plan.get_items = Mock(side_effect=lambda: self.plan.po_items.extend([
			Doc(material_request_item="ROW1", bom_no="B1"), Doc(material_request_item="ROW2", bom_no="B2")]))
		self.plan.calculate_total_planned_qty = Mock()
		result = manufacturing.prepare_plan("P1", "Material Request", "MR1", 3, "RAW", "FG", "2026-11-17", request_item="ROW1")
		self.assertEqual([(row.material_request_item, row.planned_qty) for row in result["po_items"]], [("ROW1", 3)])

	def test_request_preview_rejects_quantity_above_outstanding(self):
		item = Doc(name="ROW1", project="P1", qty=5, ordered_qty=1, conversion_factor=2)
		request = types.SimpleNamespace(name="MR1", company="C1", docstatus=1,
			material_request_type="Manufacture", items=[item], check_permission=Mock())
		original = frappe.get_doc.side_effect
		frappe.get_doc.side_effect = lambda dt, name: request if dt == "Material Request" else original(dt, name)
		self.plan.get_items = Mock()
		with self.assertRaisesRegex(ValueError, "outstanding"):
			manufacturing.prepare_plan("P1", "Material Request", "MR1", 9, "RAW", "FG", "2026-11-17", request_item="ROW1")

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

	def test_transfer_maps_selected_quantity(self):
		manufacturing.prepare_transfer("WO1", "2.5")
		mapper.make_stock_entry.assert_called_once_with("WO1", "Material Transfer for Manufacture", qty=2.5)

	def test_transfer_shortages_combine_rows_for_same_item_and_warehouse(self):
		stock_utils = types.ModuleType("erpnext.stock.utils")
		stock_utils.get_stock_balance = Mock(return_value=3)
		mapped = Doc(items=[Doc(item_code="RAW", s_warehouse="WH", stock_uom="Kg", transfer_qty=2), Doc(item_code="RAW", s_warehouse="WH", stock_uom="Kg", transfer_qty=4)])
		with patch.dict(sys.modules, {stock_utils.__name__: stock_utils}), patch.object(manufacturing, "prepare_transfer", return_value=mapped):
			result = manufacturing.transfer_shortages("WO1", 2)
		self.assertEqual(result["shortages"], [{"item": "RAW", "warehouse": "WH", "uom": "Kg", "required": 6, "available": 3, "shortage": 3}])
		stock_utils.get_stock_balance.assert_called_once_with("RAW", "WH")

	def test_invalid_transfer_quantities_are_rejected(self):
		for qty in ("0", "-1", "7", "nan", "bad"):
			with self.subTest(qty=qty), self.assertRaises(ValueError):
				manufacturing.prepare_transfer("WO1", qty)
		mapper.make_stock_entry.assert_not_called()

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

	def test_job_start_requires_reviewed_transfer(self):
		with self.assertRaisesRegex(ValueError, "Review and submit"):
			self.start()
		self.stock.insert.assert_not_called()
		self.stock.submit.assert_not_called()
		self.job_module.make_time_log.assert_not_called()

	def test_partial_transfer_can_start_without_automatic_transfer(self):
		self.wo.material_transferred_for_manufacturing = 2
		self.start()
		self.stock.insert.assert_not_called()
		self.job_module.make_time_log.assert_called_once()

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


if __name__ == "__main__":
	unittest.main()
