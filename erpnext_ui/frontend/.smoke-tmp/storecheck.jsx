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
import ReceiptItemPicker from "@/pages/Store/purchase-receipt/components/ReceiptItemPicker.jsx";
import ReceiptLineDialog from "@/pages/Store/purchase-receipt/components/ReceiptLineDialog.jsx";
import StockBalance from "@/pages/Store/stock-balance/index.jsx";
import { TrailTable } from "@/pages/Store/stock-balance/BalanceTrail.jsx";
import { BalanceTable } from "@/pages/Store/stock-balance/index.jsx";

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
  { label: "Stock Balance", path: "/store/stock-balance", C: StockBalance },
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
    // Purchase Receipt. The whole point of the rework is that the form asks for
    // numbers and never for ERPNext mechanics, so the negative assertion
    // matters more than the positive ones: a conversion-factor input creeping
    // back would silently reintroduce master-data figures.
    if (page.label.startsWith("Receipt form")) {
      const isPo = page.label.includes("from PO");
      ok(
        `${page.label}: no conversion-factor input anywhere`,
        !/factor/i.test(text),
        "a factor field must never be offered -- it is derived from the measured total",
      );
      ok(
        `${page.label}: empty state tells the user what to do`,
        text.includes("Pick the items you are receiving"),
      );
      ok(
        `${page.label}: no untranslated key leaked`,
        !text.includes("store.receipt"),
      );
      if (isPo) {
        // ERPNext pins item/project/uom to the PO line (purchase_receipt.py:315).
        // The banner must NOT claim rate is held -- rate follows Buying Settings
        // at runtime, and saying otherwise was a copy bug found by this dump.
        ok(
          "PO receipt: banner does not claim rate is locked",
          !/rate/i.test(text.split("Basic Information")[0] || ""),
        );
        ok("PO receipt: offers a way to add items", text.includes("Add items"));
      }
    }

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


/* =======================================================================
   Purchase Receipt picker + line dialog.

   Rendered through the AppModal stub because Radix's Dialog portals its
   content, making it unassertable under renderToString. The shapes below
   mirror what QA returned on 2026-10-13: a 28-line PO whose items are all
   stock_uom "Nos", plus a weighed line (stock_uom "Kg", received "Nos") to
   cover the measured-total path.
   ======================================================================= */

const NOS_INFO = {
  stock_uom: "Nos",
  uoms: [{ uom: "Nos", must_be_whole_number: 1 }, { uom: "Kg", must_be_whole_number: 0 }],
};
const KG_INFO = {
  stock_uom: "Kg",
  uoms: [{ uom: "Kg", must_be_whole_number: 0 }, { uom: "Nos", must_be_whole_number: 1 }],
};

const PO_LINES = Array.from({ length: 28 }, (_, i) => ({
  item_code: `W-0268-01-${String(i + 1).padStart(3, "0")}`,
  item_name: `Item ${i + 1}`,
  uom: "Nos",
  qty: 1,
  rate: 0,
  warehouse: "Stores - DVPL",
  purchase_order_item: `poitem-${i}`,
}));

function renderNode(node) {
  return renderToString(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <HeaderProvider>
          <RoleProvider>
            <MemoryRouter initialEntries={["/store/purchase-receipt/new"]}>{node}</MemoryRouter>
          </RoleProvider>
        </HeaderProvider>
      </ToastProvider>
    </I18nextProvider>,
  );
}
const plainText = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const pickerText = plainText(
  renderNode(
    <ReceiptItemPicker
      show
      onClose={() => {}}
      lines={PO_LINES}
      pickedKeys={["poitem-0"]}
      onPick={() => {}}
    />,
  ),
);
ok("picker: lists the first line", pickerText.includes("W-0268-01-001"));
ok("picker: reports 28 of 28", pickerText.includes("28 of 28"));
ok("picker: marks an already-picked line", pickerText.includes("Added"));
ok("picker: no translation key leaked", !/\bstore\.[a-z.]+/i.test(pickerText));

// A PO line where the UOMs match: no total field, rate held by the PO.
const plainDialog = plainText(
  renderNode(
    <ReceiptLineDialog
      show
      onClose={() => {}}
      rateEditable={false}
      uomError={null}
      onItemChange={() => {}}
      onSave={() => {}}
      row={{
        _rid: "a",
        item_code: "W-0268-01-001",
        item_name: "LV CTC",
        qty: 1,
        uom: "Nos",
        stock_uom: "Nos",
        conversion_factor: 1,
        stock_qty: 1,
        rate: 0,
        warehouse: "Stores - DVPL",
        rejected_qty: "",
        measured_total: "",
        purchase_order_item: "poitem-0",
      }}
      info={NOS_INFO}
    />,
  ),
);
ok("dialog: matching UOMs offer no measured total", !plainDialog.includes("Total received"));
ok("dialog: received unit is fixed on a PO row", plainDialog.includes("Fixed by the purchase order"));
ok("dialog: whole-number note sits on the quantity field",
   plainDialog.indexOf("cannot have a fractional") < plainDialog.indexOf("Rejected"));
ok("dialog: no conversion-factor input", !/conversion factor/i.test(plainDialog));

// A weighed line: 10 Nos received, 25.4 Kg measured.
const weighedDialog = plainText(
  renderNode(
    <ReceiptLineDialog
      show
      onClose={() => {}}
      rateEditable={true}
      uomError={null}
      onItemChange={() => {}}
      onSave={() => {}}
      row={{
        _rid: "b",
        item_code: "WEIGHED-001",
        item_name: "Weighed plate",
        qty: "10",
        uom: "Nos",
        stock_uom: "Kg",
        conversion_factor: 2.54,
        stock_qty: 25.4,
        rate: "500",
        warehouse: "Stores - WB",
        rejected_qty: "",
        measured_total: "25.4",
      }}
      info={KG_INFO}
    />,
  ),
);
ok("dialog: weighed line offers the measured total", weighedDialog.includes("Total received (Kg)"));
ok("dialog: shows the derived per-each factor", weighedDialog.includes("= 2.54 Kg each"));
ok("dialog: shows stock quantity in the stock UOM", /25\.4 Kg/.test(weighedDialog));
ok("dialog: no conversion-factor input even when weighed", !/conversion factor/i.test(weighedDialog));
ok("dialog: no translation key leaked", !/\bstore\.[a-z.]+/i.test(weighedDialog));

// A failed UOM lookup must be visible. It used to be swallowed, so a missing
// backend deployment looked exactly like "this item has one UOM".
const failedDialog = plainText(
  renderNode(
    <ReceiptLineDialog
      show
      onClose={() => {}}
      rateEditable={true}
      uomError={"Could not load unit information"}
      onItemChange={() => {}}
      onSave={() => {}}
      row={{
        _rid: "c", item_code: "X-1", item_name: "X", qty: 1, uom: "Nos",
        stock_uom: "Nos", conversion_factor: 1, stock_qty: 1, rate: 1,
        warehouse: "W", rejected_qty: "", measured_total: "",
      }}
      info={{ stock_uom: "", uoms: [], failed: true }}
    />,
  ),
);
ok("dialog: a failed UOM lookup is surfaced", failedDialog.includes("Could not load unit information"));



/* =======================================================================
   Stock balance + traceability.

   The point of this report is provenance, so the trail is asserted with the
   live CORE shape: 3 Kg from PR-26-00008 as two entries at two different rates
   (2 Kg @ 1000, 1 Kg @ 1200). A single blended rate is the failure mode this
   whole change exists to prevent, so the two rates must appear separately.
   ======================================================================= */

const CORE_ROW = {
  item_code: "CORE",
  warehouse: "Stores - DVPL",
  stock_uom: "Kg",
  opening_qty: 0,
  in_qty: 3,
  out_qty: 0,
  closing_qty: 3,
  reserved_qty: 0,
  free_qty: 3,
  stock_value: 3200,
  valuation_rate: 1066.666666667,
  projected_qty: 3,
};

const TRAIL_ROWS = [
  {
    posting_date: "2026-09-21", posting_time: "10:00:00",
    voucher_type: "Purchase Receipt", voucher_no: "PR-26-00008",
    actual_qty: 2, direction: "in", running_balance: 2,
    incoming_rate: 1000, outgoing_rate: null, stock_value: 2000,
    serial_and_batch_bundle: null, company: "DE Voltrans",
  },
  {
    posting_date: "2026-09-21", posting_time: "10:05:00",
    voucher_type: "Purchase Receipt", voucher_no: "PR-26-00008",
    actual_qty: 1, direction: "in", running_balance: 3,
    incoming_rate: 1200, outgoing_rate: null, stock_value: 1200,
    serial_and_batch_bundle: null, company: "DE Voltrans",
  },
];

function renderWithFetch(payload, node) {
  const calls = [];
  globalThis.fetch = (url, opts) => {
    calls.push(String(url));
    const body = JSON.stringify({ message: payload });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(body) });
  };
  const out = renderToString(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <HeaderProvider>
          <RoleProvider>
            <MemoryRouter initialEntries={["/store/stock-balance"]}>{node}</MemoryRouter>
          </RoleProvider>
        </HeaderProvider>
      </ToastProvider>
    </I18nextProvider>,
  );
  return { html: out, calls };
}

const summaryHtml = renderWithFetch({}, <BalanceTable rows={[CORE_ROW]} />).html;
const summaryText = plainText(summaryHtml);

ok("balance: shows the item", summaryText.includes("CORE"));
ok("balance: shows the warehouse", summaryText.includes("Stores - DVPL"));
ok("balance: shows the closing balance", /3\s*Kg/.test(summaryText));
ok("balance: shows inbound in the period", summaryText.includes("In"));
ok("balance: shows free stock", summaryText.includes("Free"));
ok("balance: shows the value", summaryText.includes("3,200"));
ok("balance: no translation key leaked", !/\bstore\.[a-z.]+/i.test(summaryText));

// The two receipts, kept separate. This is the assertion the whole report
// exists for: one blended rate would hide that this stock is two lots.
const trailHtml = renderWithFetch({}, <TrailTable itemCode="CORE" warehouse="Stores - DVPL" rows={TRAIL_ROWS} />).html;
const trailText = plainText(trailHtml);

ok("trail: names the source voucher", trailText.includes("PR-26-00008"));
ok("trail: names the voucher type", trailText.includes("Purchase Receipt"));
ok("trail: shows BOTH rates, not a blend",
   trailText.includes("1,000") && trailText.includes("1,200"),
   "the two lots must stay distinguishable");
ok("trail: shows the running balance", /Balance after/.test(trailText));
ok("trail: no translation key leaked", !/\bstore\.[a-z.]+/i.test(trailText));

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
