import "./domShim.js";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { HeaderProvider } from "@/context/HeaderContext";
import i18n from "@/i18n/index.js";
import AttendanceImport from "@/pages/HR/AttendanceImport";
import RequireEsslImportAccess from "@/components/RequireEsslImportAccess";

globalThis.fetch = () => { throw new Error("Unexpected fetch during SSR"); };
for (const language of ["en", "hi", "ar"]) {
  await i18n.changeLanguage(language);
  const html = renderToString(<I18nextProvider i18n={i18n}><HeaderProvider><AttendanceImport /></HeaderProvider></I18nextProvider>);
  assert(html.includes('type="file"'));
  assert(html.includes('accept=".xls"'));
  assert(html.includes(i18n.t("esslImport.preview")));
  assert(html.includes(i18n.t("esslImport.instructions")));
  assert(!html.includes("esslImport."), "No translation-key leaks");
  assert(!html.includes('role="combobox" aria-label="Shift"'), "No shift selector");
  const totals = i18n.t("esslImport.previewTotals", { total: 10, eligible: 6, skipped: 4 });
  assert(totals.includes("10") && totals.includes("6") && totals.includes("4"));
  assert(!totals.includes("{total}"));
  assert.equal(renderToString(<I18nextProvider i18n={i18n}><RequireEsslImportAccess><div>protected</div></RequireEsslImportAccess></I18nextProvider>), "", "Guard fails closed while loading");
}
console.log("eSSL import renders in en/hi/ar; interpolation and fail-closed guard verified.");
