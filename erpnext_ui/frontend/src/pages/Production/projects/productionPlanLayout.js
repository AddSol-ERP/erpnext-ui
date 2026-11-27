import { buildLayoutTree } from "../../../components/GenericForm/buildLayout";

// The planning workspace has already populated the plan. Hide fetch filters,
// while retaining source references, generated rows, and other live fields.
export function buildProductionPlanLayout(fields, t) {
  const available = buildLayoutTree(fields).flatMap((tab) => tab.sections.flatMap((section) => section.fields));
  const hidden = new Set(["item_code", "customer", "warehouse", "sales_order_status", "from_date", "to_date", "from_delivery_date", "to_delivery_date", "get_sales_orders", "get_material_request", "get_items"]);
  const groups = [
    { id: "overview", label: t("productionPlanForm.overview"), names: ["naming_series", "company", "project", "posting_date", "get_items_from", "status", "total_planned_qty", "total_produced_qty", "sales_orders", "material_requests"] },
    { id: "products", label: t("productionPlanForm.products"), names: ["po_items", "prod_plan_references", "combine_items"] },
    { id: "materials", label: t("productionPlanForm.materials"), names: ["mr_items", "for_warehouse", "include_non_stock_items", "include_subcontracted_items", "consider_minimum_order_qty", "include_safety_stock", "ignore_existing_ordered_qty", "get_items_for_mr", "transfer_materials"] },
    { id: "subassemblies", label: t("productionPlanForm.subassemblies"), names: ["sub_assembly_items", "combine_sub_items", "sub_assembly_warehouse", "skip_available_sub_assembly_item", "get_sub_assembly_items"] },
  ];
  const assigned = new Set([...hidden, ...groups.flatMap((group) => group.names)]);
  const tabs = groups.map((group) => {
    const sectionFields = group.names.flatMap((name) => available.filter((field) => field.fieldname === name));
    return { id: group.id, label: group.label, sections: [{ label: group.label, fields: sectionFields }] };
  }).filter((tab) => tab.sections[0].fields.length);
  const remaining = available.filter((field) => !assigned.has(field.fieldname));
  if (remaining.length) tabs.push({ id: "additional", label: t("productionPlanForm.additional"), sections: [{ label: t("productionPlanForm.additional"), fields: remaining }] });
  return tabs;
}
