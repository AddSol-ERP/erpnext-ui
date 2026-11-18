import { buildLayoutTree } from "../../../components/GenericForm/buildLayout";

// Layout only: every visible native/custom field remains available. Saving still
// uses the complete document and native BOM validation through GenericForm.
export function buildBomLayout(fields, t) {
  const available = buildLayoutTree(fields).flatMap((tab) => tab.sections.flatMap((section) => section.fields));
  const used = new Set();
  const groups = [
    ["details", ["item", "company", "project", "quantity", "uom", "is_active", "is_default", "allow_alternative_item", "set_rate_of_sub_assembly_item_based_on_bom"]],
    ["materials", ["items"]],
    ["operations", ["with_operations", "transfer_material_against", "routing", "fg_based_operating_cost", "operating_cost_per_bom_quantity", "operations"]],
    ["scrap", ["scrap_items", "process_loss_percentage", "process_loss_qty"]],
    ["costing", ["rm_cost_as_per", "buying_price_list", "price_list_currency", "plc_conversion_rate", "currency", "conversion_rate", "operating_cost", "raw_material_cost", "scrap_material_cost", "base_operating_cost", "base_raw_material_cost", "base_scrap_material_cost", "total_cost", "base_total_cost"]],
  ];
  const sections = groups.map(([key, names]) => {
    const selected = names.flatMap((name) => available.filter((field) => field.fieldname === name));
    selected.forEach((field) => used.add(field.fieldname));
    return { label: t(`bomForm.${key}`), fields: selected };
  }).filter((section) => section.fields.length);
  const rest = available.filter((field) => !used.has(field.fieldname));
  if (rest.length) sections.push({ label: t("bomForm.additional"), fields: rest });
  return sections.map((section, index) => ({
    id: `bom-${index}`,
    label: section.label,
    sections: [section],
  }));
}

export const BOM_TABLE_COLUMNS = {
  "BOM Item": ["item_code", "qty", "uom", "rate", "amount", "bom_no"],
  "BOM Operation": ["operation", "workstation", "time_in_mins", "hour_rate", "operating_cost"],
  "BOM Scrap Item": ["item_code", "stock_qty", "stock_uom", "rate", "amount"],
};
