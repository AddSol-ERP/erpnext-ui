/**
 * Field type renderer registry.
 * Maps ERPNext fieldtypes to React components.
 *
 * Each renderer receives: { field, value, onChange, error }
 *   - field: the doctype field definition from metadata
 *   - value: current value
 *   - onChange(newValue): called when value changes
 *   - error: validation error message (optional)
 */

import DataField from "./DataField";
import TextField from "./TextField";
import SelectField from "./SelectField";
import LinkFieldWrapper from "./LinkFieldWrapper";
import DateField from "./DateField";
import DatetimeField from "./DatetimeField";
import TimeField from "./TimeField";
import CheckboxField from "./CheckboxField";
import CurrencyField from "./CurrencyField";
import FloatField from "./FloatField";
import IntField from "./IntField";
import ReadonlyField from "./ReadonlyField";

const FIELD_RENDERERS = {
  /* Basic text */
  Data: DataField,
  "Small Text": TextField,
  Text: TextField,
  "Long Text": TextField,

  /* Select / Options */
  Select: SelectField,

  /* Links */
  Link: LinkFieldWrapper,

  /* Date/Time */
  Date: DateField,
  Datetime: DatetimeField,
  Time: TimeField,

  /* Numeric */
  Currency: CurrencyField,
  Float: FloatField,
  Int: IntField,
  Percent: FloatField,
  Rating: IntField,

  /* Boolean */
  Check: CheckboxField,

  /* Read-only / display */
  "Read Only": ReadonlyField,

  /* Fallback */
  default: DataField,
};

export function getFieldRenderer(fieldtype) {
  return FIELD_RENDERERS[fieldtype] || FIELD_RENDERERS.default;
}

export { default as DataField } from "./DataField";
export { default as TextField } from "./TextField";
export { default as SelectField } from "./SelectField";
export { default as LinkFieldWrapper } from "./LinkFieldWrapper";
export { default as DateField } from "./DateField";
export { default as DatetimeField } from "./DatetimeField";
export { default as TimeField } from "./TimeField";
export { default as CheckboxField } from "./CheckboxField";
export { default as CurrencyField } from "./CurrencyField";
export { default as FloatField } from "./FloatField";
export { default as IntField } from "./IntField";
export { default as ReadonlyField } from "./ReadonlyField";
