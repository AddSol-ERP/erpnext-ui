from frappe.model.document import Document


class UIUomPricingSettings(Document):
	"""Site level switches that turn the generic UOM based pricing on or off.

	The master switch gates the feature; the Buying and Selling switches sit under
	it so a customer can adopt one side at a time. Both sub switches default OFF,
	which keeps unconfigured sites on standard ERPNext quantity and rate behaviour.
	"""

	def validate(self):
		self.validate_enable_flags()

	def validate_enable_flags(self):
		"""Coerce absent flags to 0 so the effective state resolver never sees None."""
		for fieldname in ("enable_uom_pricing", "enable_buying", "enable_selling"):
			value = getattr(self, fieldname, None)
			if value is None:
				setattr(self, fieldname, 0)
