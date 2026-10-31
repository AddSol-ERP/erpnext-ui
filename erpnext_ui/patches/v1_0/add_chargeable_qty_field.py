"""Add `custom_chargeable_qty` to the buying/selling item tables.

The chargeable quantity (the quantity in the pricing UOM the line is actually
billed on) was always derived server-side from the pricing rule, so a real-world
measurement that differed from the calculated weight could not be recorded at
all. Storing the entered value lets `_apply_uom_pricing` price from it and lets
the rule's +/- tolerance be checked against the calculated baseline.

Left blank the row behaves exactly as before: the calculated value is used.

The table list is shared with `add_uom_pricing_rate_field` so the two custom
fields cannot drift onto different sets of doctypes.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from erpnext_ui.patches.v1_0.add_uom_pricing_rate_field import ITEM_TABLES

CHARGEABLE_FIELD = {
	"fieldname": "custom_chargeable_qty",
	"fieldtype": "Float",
	"label": "Chargeable Qty",
	"insert_after": "custom_rate_per_pricing_uom",
	"description": "Quantity in the pricing UOM this line is charged on. "
	"Leave blank to use the value calculated from the pricing rule.",
}

FIELDS = {dt: [dict(CHARGEABLE_FIELD)] for dt in ITEM_TABLES}


def execute() -> None:
	try:
		create_custom_fields(FIELDS)
		frappe.clear_cache()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "add_chargeable_qty_field failed")
		raise
