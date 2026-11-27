import { buildLayoutTree } from "../../../components/GenericForm/buildLayout";

// Layout only: every visible native/custom field remains available. Saving still
// uses the complete document and native BOM validation through GenericForm.
export function buildBomLayout(fields, t, { template = false } = {}) {
  const available = buildLayoutTree(fields).flatMap((tab) => tab.sections.flatMap((section) => section.fields));
  const used = new Set();
  const groups = [
    ["details", [...(template ? ["naming_series", "template_name", "enabled", "description"] : []), "item", "company", "project", "quantity", "uom", "is_active", "is_default", "allow_alternative_item", "set_rate_of_sub_assembly_item_based_on_bom"]],
    ["materials", ["items"]],
    ...(!template ? [["explodedItems", ["exploded_items"]]] : []),
    ["operations", ["with_operations", "transfer_material_against", "routing", "fg_based_operating_cost", "operating_cost_per_bom_quantity", "operations", "custom_approval_rules"]],
    ["scrap", ["scrap_items", "process_loss_percentage", "process_loss_qty"]],
    ["costing", ["rm_cost_as_per", "buying_price_list", "price_list_currency", "plc_conversion_rate", "currency", "conversion_rate", "operating_cost", "raw_material_cost", "scrap_material_cost", "base_operating_cost", "base_raw_material_cost", "base_scrap_material_cost", "total_cost", "base_total_cost"]],
    ...(!template ? [["approvedVendors", ["custom_avl_applicable", "custom_approved_vendor_files"]]] : []),
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

export function buildPlanningBomLayout(fields, t) {
  const sections = buildBomLayout(fields, t).flatMap((tab) => tab.sections);
  const groups = [
    { id: "product", label: t("bomPlanning.product"), sections: [] },
    { id: "materials", label: t("bomPlanning.materials"), sections: [] },
    { id: "operations", label: t("bomPlanning.operations"), sections: [] },
    { id: "extras", label: t("bomPlanning.extras"), sections: [] },
  ];
  for (const section of sections) {
    const names = new Set(section.fields.map((field) => field.fieldname));
    const index = names.has("item") ? 0 : names.has("items") || names.has("exploded_items") ? 1 : names.has("operations") || names.has("with_operations") ? 2 : 3;
    groups[index].sections.push(section);
  }
  return [...groups.filter((group) => group.sections.length), { id: "review", label: t("bomPlanning.review"), sections: [] }];
}

export const BOM_TABLE_COLUMNS = {
  "UI BOM Template Item": ["item_code", "qty", "uom", "rate"],
  "UI BOM Template Operation": ["operation", "workstation", "time_in_mins", "hour_rate"],
  "UI BOM Template Scrap Item": ["item_code", "stock_qty", "stock_uom", "rate"],
  "BOM Item": ["item_code", "item_name", "qty", "uom", "custom_pricing_uom", "custom_rate_per_pricing_uom", "rate", "amount", "custom_purchase_rate", "custom_purchase_amount"],
  "BOM Explosion Item": ["item_code", "item_name", "stock_qty", "stock_uom", "rate", "amount"],
  "BOM Operation": ["operation", "workstation", "time_in_mins", "hour_rate", "operating_cost"],
  "BOM Scrap Item": ["item_code", "stock_qty", "stock_uom", "rate", "amount"],
};

export function bomTableColumns(doctype, fields) {
  const columns = BOM_TABLE_COLUMNS[doctype];
  if (!columns) return undefined;
  const available = new Set(fields.filter((field) => !field.hidden).map((field) => field.fieldname));
  return doctype === "BOM Item" && available.has("custom_purchase_rate") && available.has("custom_purchase_amount")
    ? columns.filter((field) => !["rate", "amount", "custom_pricing_uom", "custom_rate_per_pricing_uom"].includes(field))
    : columns;
}
