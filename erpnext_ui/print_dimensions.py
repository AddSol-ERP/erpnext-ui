"""Compact, plain-text parameter display shared by Jinja and builder prints."""

import json
import math


def pricing_dimensions(row):
	"""Read frozen values and units; never substitute today's Item dimensions."""
	raw = row.get("custom_pricing_snapshot")
	if not raw:
		return row.get("custom_pricing_dimensions") or ""
	try:
		snapshot = json.loads(raw) if isinstance(raw, str) else raw
	except (ValueError, TypeError):
		return row.get("custom_pricing_dimensions") or ""
	if not isinstance(snapshot, dict):
		return ""
	if snapshot.get("display_dimensions") is not None:
		return str(snapshot["display_dimensions"])
	values = snapshot.get("params_by_symbol") or {}
	units = snapshot.get("parameter_uoms") or {}
	parameters = snapshot.get("rule", {}).get("params") or []
	parts = []
	for _, parameter in sorted(
		enumerate(parameters), key=lambda entry: (entry[1].get("display_order") or 0, entry[0])
	):
		symbol = parameter.get("symbol")
		# Historical calibration constants are internal, rather than dimensions.
		if not (parameter.get("label") or parameter.get("data_source") or parameter.get("uom")):
			continue
		value = values.get(symbol)
		if value is None or value == "":
			continue
		try:
			number = float(value)
		except (TypeError, ValueError):
			continue
		if not math.isfinite(number):
			continue
		uom = units.get(symbol) or parameter.get("uom") or ""
		parts.append(f"{symbol} {number:.12g}" + (f" {uom}" if uom else ""))
	return " \u00d7 ".join(parts)
