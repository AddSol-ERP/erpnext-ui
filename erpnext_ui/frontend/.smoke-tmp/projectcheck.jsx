import "./domShim.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { MemoryRouter, matchRoutes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HeaderProvider } from "@/context/HeaderContext";
import i18n from "@/i18n/index.js";
import Projects from "@/pages/Projects";
import { buildBomLayout } from "@/pages/Projects/bom/layout";
import ChildTable from "@/components/ChildTable";
import PlanningContent from "@/pages/Production/projects/PlanningContent";
import { applyDoctypeAccess, getAccessibleModules, getFailClosedModules } from "@/config/moduleAccess";

const coarse = getAccessibleModules(["Employee"]);
assert(coarse.includes("Projects"));
assert(!getFailClosedModules().includes("Projects"));
assert(!applyDoctypeAccess(coarse, {}).includes("Projects"));
assert(!applyDoctypeAccess(coarse, { reports: { attendance: true, manufacturing: false } }).includes("Projects"));
assert(applyDoctypeAccess(coarse, { reports: { manufacturing: true } }).includes("Projects"));

globalThis.fetch = () => { throw new Error("Unexpected fetch during render"); };
for (const language of ["en", "hi", "ar"]) {
  await i18n.changeLanguage(language);
  for (const tab of ["active", "inactive"]) {
    const html = renderToString(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[`/projects?tab=${tab}`]}><HeaderProvider><Projects /></HeaderProvider></MemoryRouter></I18nextProvider>);
    assert(!html.includes("projects."), `${language}/${tab}: untranslated key`);
    assert(html.includes(i18n.t("projects.active")));
    assert(html.includes(i18n.t("projects.inactive")));
    assert(html.includes(i18n.t("common.searchPlaceholder")));
    assert(html.includes(`aria-pressed="true"`));
  }
}
const app = readFileSync("src/App.jsx", "utf8");
const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => ({ path: match[1] }));
for (const [url, expected] of [
  ["/projects", "/projects"],
  ["/projects/view/PROJ-001", "/projects/view/:project"],
  ["/projects/view/PROJ-001/manufacturing", "/projects/view/:project/manufacturing"],
  ["/projects/Project/new", "/projects/:doctype/new"],
  ["/projects/BOM/new", "/projects/:doctype/new"],
  ["/projects/BOM/BOM-001", "/projects/:doctype/:name"],
]) assert.equal(matchRoutes(routes, url).at(-1).route.path, expected);
console.log("Projects permission, routes and EN/HI/AR render checks passed");

const manufacturingData = {
  project: { project_name: "Project One", company: "Company One" },
  boms: [{ name: "BOM-FG-001", docstatus: 1 }],
  sales_orders: [], material_requests: [], job_cards: [],
  plans: [{ name: "PLAN-001", docstatus: 1, status: "Submitted", total_planned_qty: 5 }],
  work_orders: [{ name: "WO-001", docstatus: 1, status: "Not Started", production_item: "FG-001", qty: 5, produced_qty: 0 }],
};
const preview = { po_items: [{ item_code: "FG-001", bom_no: "BOM-FG-001", planned_qty: 5, stock_uom: "Nos" }],
  mr_items: [{ item_code: "RAW-001", required_bom_qty: 10, actual_qty: 2, quantity: 4, uom: "Box", stock_uom: "Kg" }] };
for (const language of ["en", "hi", "ar"]) {
  await i18n.changeLanguage(language);
  for (const step of ["setup", "materials", "plans", "orders", "timeline"]) {
    const html = renderToString(<I18nextProvider i18n={i18n}><PlanningContent step={step} data={manufacturingData} source="BOM" sourceName="BOM-FG-001" qty={5}
      start="2026-11-17T09:00" warehouses={{ source: "Stores", wip: "WIP", fg: "Finished" }} preview={preview} busy={false} /></I18nextProvider>);
    assert(!html.includes("manufacturing."), `${language}/${step}: untranslated planning key`);
    assert(!html.includes("projects."), `${language}/${step}: untranslated project key`);
    if (step === "materials") {
      for (const text of ["RAW-001", "FG-001", "BOM-FG-001", "Box"]) assert(html.includes(text), `${language}: missing ${text}`);
      assert(!html.includes("PLAN-001"));
      assert(!html.includes("WO-001"));
    } else assert(!html.includes("RAW-001"), `${step}: materials must not render on another step`);
    if (step === "plans") { assert(html.includes("PLAN-001")); assert(html.includes(i18n.t("manufacturing.createOrders"))); }
    if (step === "orders") { assert(html.includes("WO-001")); assert(html.includes(i18n.t("manufacturing.transfer"))); }
    if (step === "setup") { assert(!html.includes("PLAN-001")); assert(!html.includes("WO-001")); }
  }
}
console.log("Production planning renders one step at a time in EN/HI/AR");

const bomFields = [
  { fieldname: "production_tab", fieldtype: "Tab Break", label: "Production" },
  { fieldname: "item", fieldtype: "Link", label: "Item" },
  { fieldname: "quantity", fieldtype: "Float", label: "Quantity" },
  { fieldname: "items", fieldtype: "Table", label: "Items" },
  { fieldname: "with_operations", fieldtype: "Check", label: "With operations" },
  { fieldname: "custom_engineering_note", fieldtype: "Data", label: "Engineering note" },
  { fieldname: "secret", fieldtype: "Data", hidden: 1 },
];
for (const language of ["en", "hi", "ar"]) {
  await i18n.changeLanguage(language);
  const tree = buildBomLayout(bomFields, i18n.t.bind(i18n));
  assert.equal(tree.length, 4);
  assert.equal(tree[0].sections[0].label, i18n.t("bomForm.details"));
  assert.equal(tree[1].label, i18n.t("bomForm.materials"));
  const names = tree.flatMap((tab) => tab.sections.flatMap((section) => section.fields.map((field) => field.fieldname)));
  assert.deepEqual([...names].sort(), ["item", "quantity", "items", "with_operations", "custom_engineering_note"].sort());
  const html = renderToString(<I18nextProvider i18n={i18n}><ChildTable title="BOM materials" compactFields={["item_code", "qty"]}
    columns={[{field: "item_code", label: "Material", type: "text"}, {field: "qty", label: "Quantity", type: "number"}, {field: "description", label: "Detailed description", type: "text"}]}
    value={[{item_code: "RAW-001", qty: 2, description: "Preserved detail"}]} /></I18nextProvider>);
  assert(html.includes("RAW-001"));
  assert(html.includes(i18n.t("common.edit")));
  assert(!html.includes("Detailed description"));
  const desktopBody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];
  assert.equal(desktopBody.split(`>${i18n.t("common.edit")}</button>`).length - 1, 1, "One desktop Edit action per row");
  assert(!desktopBody.includes("</td><button"), "Buttons must be inside table cells");
  const mobileBody = html.split('class="flex flex-col gap-3 p-3 md:hidden"')[1];
  assert.equal(mobileBody.split(`>${i18n.t("common.edit")}</button>`).length - 1, 1, "One mobile Edit action per row");
}
console.log("BOM layout preserves native/custom fields and compact materials render in EN/HI/AR");
