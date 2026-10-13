import "./domShim.js";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HeaderProvider } from "@/context/HeaderContext";
import { RoleProvider } from "@/context/RoleContext";
import { ToastProvider } from "@/context/ToastContext";
import i18n from "@/i18n/index.js";

import StoreDashboard from "@/pages/Store/index.jsx";
import MaterialRequestList from "@/pages/Store/material-request/list/index.jsx";
import IndentQueue from "@/pages/Store/indents/index.jsx";
import PurchaseReceiptPicker from "@/pages/Store/purchase-receipt/index.jsx";
import PurchaseReceiptForm from "@/pages/Store/purchase-receipt/form/index.jsx";
import StockEntryPage from "@/components/StockEntry/StockEntryPage.jsx";
import ESSDashboard from "@/pages/ESS/index.jsx";

/*
 * Renders the Store surfaces and asserts that NO translation key leaks into the
 * output as a raw key or as i18next's "returned an object instead of string"
 * error.
 *
 * This exists because of a shipped bug: the Store hub passed
 * `titleKey: "store.tiles.stockEntry"` when `store.tiles.stockEntry` is an
 * OBJECT `{title, description}`. i18next returns the object, React renders its
 * warning text, and the tile shows:
 *
 *   key 'store.tiles.stockEntry (en)' returned an object instead of string.
 *
 * A plain dictionary-walk check passes that key -- it exists, after all -- which
 * is why the bug survived a full i18n parity audit in all three languages. Only
 * actually resolving and rendering catches it.
 */
globalThis.fetch = () => {
  throw new Error("unexpected fetch during Store render");
};

const PAGES = [
  { label: "Store dashboard", path: "/store", C: StoreDashboard },
  { label: "All requests", path: "/store/material-request", C: MaterialRequestList },
  { label: "Give Items queue", path: "/store/indents", C: IndentQueue },
  { label: "Purchase Receipt picker", path: "/store/purchase-receipt", C: PurchaseReceiptPicker },
  // Without a PO and with one: both entry paths into the receipt form.
  { label: "Receipt form (no PO)", path: "/store/purchase-receipt/new", C: PurchaseReceiptForm },
  { label: "Stock Entry", path: "/store/stock-entry", C: StockEntryPage },
  { label: "Employee Self Service", path: "/ess", C: ESSDashboard },
  {
    label: "Receipt form (from PO)",
    path: "/store/purchase-receipt/new?po=PUR-ORD-2025-00009",
    C: PurchaseReceiptForm,
  },
];

let pass = 0;
let fail = 0;

// Anything that looks like a dotted i18n key, or i18next's own object warning.
const LEAK = /\b(?:store|ess|requests|nav|common|theme|language|footer|modules|dashboard|userMenu)\.[A-Za-z0-9_.]+|returned an object instead of string/;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  FAIL:", name, detail ? `\n        ${detail}` : "");
  }
}

for (const page of PAGES) {
  let html = "";
  let err = null;
  try {
    html = renderToString(
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <HeaderProvider>
            <RoleProvider>
              <MemoryRouter initialEntries={[page.path]}>
                <Routes>
                  {/* Route path is a pathname pattern: a query string in it
                      never matches, so strip it and let MemoryRouter carry it. */}
                  <Route path={page.path.split("?")[0]} element={<page.C />} />
                </Routes>
              </MemoryRouter>
            </RoleProvider>
          </HeaderProvider>
        </ToastProvider>
      </I18nextProvider>
    );
  } catch (e) {
    err = e;
  }

  ok(`${page.label}: renders without throwing`, !err, err && String(err.message || err));

  if (!err) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const leaked = text.match(LEAK);
    ok(`${page.label}: no translation key leaked into the UI`, !leaked, leaked && `found: ${leaked[0]}`);
    // Non-empty, not "large": the Give Items queue is mid-loading here (fetch
    // is stubbed to throw), so its markup is legitimately short. Asserting a
    // byte count would be testing React's render timing, not i18n.
    ok(`${page.label}: produced markup`, html.length > 0, `len=${html.length}`);

    // The Stock Entry screen defaults posting date/time to now. Both used to be
    // null, which rendered two blank inputs on a screen whose job is recording a
    // movement happening right now.
    // The merged ESS dashboard. `ess.tiles.*` are {title, description} objects,
    // so a titleKey missing its `.title` renders i18next's object warning as the
    // tile's own title. That is invariant 16, and the leak check above catches
    // the warning text -- this asserts the nine names actually show up.
    if (page.label === "Employee Self Service") {
      const EXPECTED = [
        "My Details", "Apply for Leave", "My Leave Balance",
        "Fix My Attendance", "My Attendance", "My Overtime",
        "Claim an Expense", "My Payslips", "My Tasks",
      ];
      for (const name of EXPECTED) {
        ok(`ESS dashboard: tile "${name}" rendered`, text.includes(name));
      }
      // The retired standalone Requests hub must not be reachable as a tile.
      ok("ESS dashboard: no leftover 'Requests' group",
         !/^Requests$/m.test(text) && !text.includes("Employee Self Service Requests"));
    }

    if (page.label === "Stock Entry") {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      ok("Stock Entry: posting date defaults to today", html.includes(`value="${today}"`), `expected ${today}`);
      ok("Stock Entry: posting time defaults to now", html.includes(`value="${nowHM}"`), `expected ${nowHM}`);
    }
  }
}

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
