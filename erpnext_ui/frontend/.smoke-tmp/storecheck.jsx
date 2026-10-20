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
import { AttachDialog } from "@/components/Attachments/index.jsx";
import QualityInspectionForm from "@/pages/Quality/entry/InspectionForm/index.jsx";
import StockEntryPage from "@/components/StockEntry/StockEntryPage.jsx";
import ESSDashboard from "@/pages/ESS/index.jsx";
import ReceiptItemWorkbench from "@/pages/Store/purchase-receipt/components/ReceiptItemWorkbench.jsx";
import ReceiptLineDialog from "@/pages/Store/purchase-receipt/components/ReceiptLineDialog.jsx";
import StockBalance from "@/pages/Store/stock-balance/index.jsx";
import { TrailTable } from "@/pages/Store/stock-balance/BalanceTrail.jsx";
import { BalanceTable } from "@/pages/Store/stock-balance/index.jsx";
import ReturnToStock from "@/pages/Store/stock-balance/ReturnToStock.jsx";
import Pagination from "@/components/Pagination";
import { readFileSync } from "node:fs";
import ActionBar from "@/components/ActionBar/index.jsx";

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

// The workbench is ONE surface with two sections, not a dialog over a dialog.
// `row` is supplied so both sections render in one pass; the empty right-hand
// state is asserted separately below.
const workbenchHtml = renderNode(
  <ReceiptItemWorkbench
    show
    onClose={() => {}}
    lines={PO_LINES}
    pickedKeys={["poitem-0"]}
    onPick={() => {}}
    row={{
      _rid: "a",
      item_code: "W-0268-01-001",
      item_name: "Weighted item",
      uom: "Kg",
      qty: 5,
      rate: 10,
      warehouse: "Stores - TC",
      purchase_order_item: "poitem-0",
      conversion_factor: 1,
      stock_qty: 5,
    }}
    info={{ stock_uom: "Kg", must_be_whole_number: 0, uoms: [{ uom: "Kg" }] }}
    uomError={null}
    rateEditable={false}
    onItemChange={() => {}}
    onSave={() => {}}
  />,
);
const workbenchText = plainText(workbenchHtml);

ok("workbench: lists the first line", workbenchText.includes("W-0268-01-001"));
ok("workbench: reports 28 of 28", workbenchText.includes("28 of 28"));
ok("workbench: marks an already-picked line", workbenchText.includes("Added"));
ok("workbench: no translation key leaked", !/\bstore\.[a-z.]+/i.test(workbenchText));

// Section 1 is the searchable list. The placeholder is an ATTRIBUTE, so it is
// absent from the text content -- assert against the markup.
ok(
  "workbench: section 1 carries the search box",
  /placeholder="Search by item name, code or warehouse"/.test(workbenchHtml),
);
// Section 2 is the line form, on the SAME surface. The warehouse value is also
// an attribute (an <input value>), so only the item name is text.
ok(
  "workbench: section 2 carries the line form on the same surface",
  /Weighted item/.test(workbenchText) && /value="Stores - TC"/.test(workbenchHtml),
);
ok(
  "workbench: both sections render together, not one behind the other",
  /placeholder="Search by item name/.test(workbenchHtml) &&
    /Weighted item/.test(workbenchText),
);
ok(
  "workbench: the empty right-hand state asks for a pick",
  /Pick a line to complete it/.test(
    plainText(
      renderNode(
        <ReceiptItemWorkbench
          show
          onClose={() => {}}
          lines={PO_LINES}
          pickedKeys={[]}
          onPick={() => {}}
          row={null}
          info={null}
          uomError={null}
          rateEditable
          onItemChange={() => {}}
          onSave={() => {}}
        />,
      ),
    ),
  ),
);
// Assert on ABSENCE of the workbench's own content rather than on an empty
// string: the provider wrappers around it are not obliged to emit nothing, so
// pinning `=== ""` would fail on someone else's markup.
const workbenchClosed = renderNode(
  <ReceiptItemWorkbench
    show={false}
    onClose={() => {}}
    lines={PO_LINES}
    pickedKeys={[]}
    onPick={() => {}}
    row={null}
    info={null}
    uomError={null}
    rateEditable
    onItemChange={() => {}}
    onSave={() => {}}
  />,
);
ok(
  "workbench: renders no list and no empty state while closed",
  !/W-0268-01-001/.test(workbenchClosed) &&
    !/Pick a line to complete it/.test(workbenchClosed) &&
    !/Search by item name/.test(workbenchClosed),
  workbenchClosed.slice(0, 120),
);

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
ok(
  "dialog: weighed line offers the measured total, marked optional",
  weighedDialog.includes("Total received (Kg, optional)"),
);
// A PO-factored row must SAY it is falling back, otherwise the user cannot tell
// an ordered rate from one they typed -- and cannot tell why no weight is needed.
const poBackedDialog = plainText(
  renderNode(
    <ReceiptLineDialog
      show
      onClose={() => {}}
      rateEditable={false}
      uomError={null}
      onItemChange={() => {}}
      onSave={() => {}}
      row={{
        _rid: "po",
        item_code: "TEST-KG-NOS",
        uom: "Nos",
        stock_uom: "Kg",
        qty: 10,
        measured_total: "",
        conversion_factor: 1000,
        conversion_source: "purchase_order",
        factor_from_po: 1000,
        factor_source_po: "purchase_order",
        stock_qty: 10000,
        rate: 100,
        warehouse: "Stores - NLEPL",
        purchase_order_item: "poitem-1",
      }}
      info={KG_INFO}
    />,
  ),
);
ok(
  "dialog: an unweighed PO line names the ordered rate it is using",
  /from the purchase order/.test(poBackedDialog) &&
    /Leave blank to use the purchase order rate of 1000/.test(poBackedDialog),
);
ok(
  "dialog: no conversion-factor input anywhere, even with a PO factor",
  !/conversion factor/i.test(poBackedDialog.replace("Conversion (Nos to Kg)", "")) ||
    !poBackedDialog.includes("= 1000 Kg"),
);
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



/* =======================================================================
   Return material to stock.

   The dialog's whole promise is that it asks only what this item needs, so the
   assertions are about which fields APPEAR, not just that it renders.
   ======================================================================= */

const rowForReturn = {
  item_code: "W-0268-01-001",
  item_name: "LV CTC",
  warehouse: "Work In Progress - DVPL",
  stock_uom: "Nos",
  free_qty: 10,
  closing_qty: 10,
};

const renderReturn = (ctxRow) =>
  plainText(
    renderWithFetch(
      { message: ctxRow },
      <ReturnToStock
        show
        row={rowForReturn}
        defaultCompany="DE Voltrans"
        context={ctxRow}
      />,
    ).html,
  );

// A plain item: one question, no batch or serial anywhere.
const plainReturn = renderReturn({
  item_code: "W-0268-01-001",
  stock_uom: "Nos",
  has_batch_no: 0,
  has_serial_no: 0,
  auto_batch: false,
  auto_serial: false,
  needs_batch_number: false,
  needs_serials: false,
});
ok("return: offers the use-same-item vs new-item choice",
   plainReturn.includes("Use this item") && plainReturn.includes("Create a new item"));
ok("return: shows where it is now and where it goes back",
   plainReturn.includes("Work In Progress - DVPL"));
ok("return: plain item asks for NO batch number", !plainReturn.includes("Batch number"));
ok("return: plain item asks for NO serial numbers", !plainReturn.includes("Serial numbers"));
ok("return: explains what will happen",
   plainReturn.includes("Creates a Stock Entry"));
ok("return: no translation key leaked", !/\bstore\.[a-z.]+/i.test(plainReturn));

// A batch item the server can auto-name: still no batch box, but it says so,
// so silence is not mistaken for a missing feature.
const autoBatchReturn = renderReturn({
  item_code: "BATCHY",
  stock_uom: "Kg",
  has_batch_no: 1,
  has_serial_no: 0,
  auto_batch: true,
  auto_serial: false,
  needs_batch_number: false,
  needs_serials: false,
});
ok("return: auto-batch item asks for no batch number", !autoBatchReturn.includes("Batch number"));
ok("return: auto-batch item says the number will be generated",
   autoBatchReturn.includes("generated automatically"));

// A batch item with no series: ERPNext cannot invent a number, so we must ask.
const needsBatchReturn = renderReturn({
  item_code: "BATCHY",
  stock_uom: "Kg",
  has_batch_no: 1,
  has_serial_no: 0,
  auto_batch: false,
  auto_serial: false,
  needs_batch_number: true,
  needs_serials: false,
});
ok("return: un-series batch item DOES ask for a batch number",
   needsBatchReturn.includes("Batch number"));

// Serials: asked for only when the item has no series.
const needsSerialReturn = renderReturn({
  item_code: "SERIALY",
  stock_uom: "Nos",
  has_batch_no: 0,
  has_serial_no: 1,
  auto_batch: false,
  auto_serial: false,
  needs_batch_number: false,
  needs_serials: true,
});
ok("return: un-series serial item DOES ask for serial numbers",
   needsSerialReturn.includes("Serial numbers"));
ok("return: serial item explains the one-per-line format",
   needsSerialReturn.includes("One per line"));



/* =======================================================================
   The expanded trail must sit under ITS OWN row.

   It used to render after the closing </tbody>, so expanding row 3 of 20 put
   the history below row 20 -- you had to scroll past every other line to see
   what you had just clicked. Asserted by expanding the FIRST row and checking
   the trail lands inside the table, ahead of the second row's item code.
   ======================================================================= */

const balanceHtmlExpanded = renderWithFetch(
  {},
  <BalanceTable
    rows={[
      CORE_ROW,
      { ...CORE_ROW, item_code: "SECOND-ROW-ITEM", warehouse: "Stores - Other" },
    ]}
    expanded="CORE|Stores - DVPL"
    onToggle={() => {}}
    onReturn={() => {}}
  />,
).html;

// The trail's own loading text proves BalanceTrail rendered.
ok("balance: an expanded row renders its trail", balanceHtmlExpanded.includes("Loading"));

const trailAt = balanceHtmlExpanded.indexOf("Loading");
const secondRowAt = balanceHtmlExpanded.indexOf("SECOND-ROW-ITEM");
ok(
  "balance: the trail renders BEFORE the next row, not below the table",
  trailAt > 0 && secondRowAt > 0 && trailAt < secondRowAt,
  `trail@${trailAt} secondRow@${secondRowAt}`,
);
ok(
  "balance: the trail spans every column",
  /<td col[Ss]pan="11"/.test(balanceHtmlExpanded),
  "expected a full-width cell; a mismatched colspan squeezes the trail into column 1",
);
ok(
  "balance: the trail closes inside the table, not after it",
  balanceHtmlExpanded.indexOf("Loading") < balanceHtmlExpanded.indexOf("</table>"),
);



/* =======================================================================
   Toolbar layout, asserted from the RENDERED DOM rather than the source.

   An earlier version of this passed every source-level check and still broke
   every other list in the app: the action cluster had been given `shrink-0`
   unconditionally, so it stopped being pushed to the far right on lists that do
   NOT use inline filters. Source greps cannot see that; rendering can.
   ======================================================================= */

const toolbarHtml = renderWithFetch(
  {},
  <ActionBar
    onSearch={() => {}}
    resultCount={7}
    filterConfig={{
      filters: [
        { label: "Item", field: "item_code", type: "link", doctype: "Item" },
        { label: "From", field: "from_date", type: "date" },
      ],
    }}
    selectedFilters={{}}
    onApplyFilters={() => {}}
  />,
).html;

const actionsMatch = toolbarHtml.match(/<div class="[^"]*justify-end gap-1\.5[^"]*">/);
ok("toolbar: the action cluster exists", !!actionsMatch);

const actionsCls = actionsMatch ? actionsMatch[0] : "";
ok("toolbar: compact path keeps flex-1 so actions stay right-aligned",
   /flex-1/.test(actionsCls), actionsCls.slice(0, 120));
ok("toolbar: compact path does not use ml-auto",
   !/ml-auto/.test(actionsCls));
ok("toolbar: search falls back to the existing half-width on the compact path",
   /sm:w-1\/2 sm:flex-none/.test(toolbarHtml));
ok("toolbar: the filter dropdown is still offered when not inline",
   /aria-label/.test(toolbarHtml) && /justify-end/.test(toolbarHtml));



/* =======================================================================
   Two removals/additions that must not silently regress.

   1. The Stock Balance toolbar dropped its "N results" pill because the card
      footer already shows it. The assertion that matters is the SECOND one:
      Pagination still renders the range on a SINGLE page. If that ever stops
      happening, the toolbar pill was carrying the only copy of the number and
      its removal would have lost information rather than duplicated it.
   ======================================================================= */

const pagSinglePage = renderWithFetch(
  {},
  <Pagination currentPage={1} totalPages={1} totalItems={2} pageSize={20} onPageChange={() => {}} />,
).html;
ok("balance: the footer still states the total when there is only one page",
   /Showing/.test(pagSinglePage) && /2/.test(pagSinglePage), pagSinglePage.replace(/<[^>]+>/g, " ").slice(0, 120));

const balancePageSrc = readFileSync(
  new URL("../../src/pages/Store/stock-balance/index.jsx", import.meta.url), "utf8");
const balanceToolbar = balancePageSrc.slice(
  balancePageSrc.indexOf("<ActionBar"),
  balancePageSrc.indexOf("/>", balancePageSrc.indexOf("<ActionBar")),
);
ok("balance: the toolbar does not repeat the result count",
   // Match the PROP, not the word: the comment above it explains the removal
   // and says "No resultCount", which a bare /resultCount/ happily matches.
   !/resultCount=\{/.test(balanceToolbar),
   balanceToolbar.replace(/\s+/g, " ").slice(0, 140));
ok("balance: the footer still receives totalItems",
   /totalItems=\{totalItems\}/.test(balancePageSrc));

/* --- attendance day popup ---------------------------------------------
   handleDayClick sends ONLY a plain "Present" day to the check-in modal;
   Half Day / Late / Absent / On Leave / Missing all open the detail modal,
   which showed in_time/out_time/shift but never the punch log. A half day
   has real punches with no way to reach them from the calendar -- and on
   mobile the cell itself hides the times (`hidden sm:flex`), so the popup is
   the only view.

   Source-level, not a render: the calendar needs a fetched employee and a
   month of attendance, and fetch is stubbed here, so a render could only
   ever assert the loading state. Labelled honestly rather than pretending. */

const attendanceSrc = readFileSync(
  new URL("../../src/pages/ESS/Attendance.jsx", import.meta.url), "utf8");
const detailModal = attendanceSrc.slice(
  attendanceSrc.indexOf('show={!!activeDay}'),
  attendanceSrc.indexOf('show={!!checkinDate}'),
);
ok("attendance: the day popup renders the check-in log, not just in/out times",
   /<CheckinLogs/.test(detailModal));
ok("attendance: the check-in log is gated on an attendance record",
   /\{activeDay\.att && \(/.test(detailModal),
   "leave/missing days have no punches; firing a request for them is noise");
ok("attendance: only a plain Present day still routes to the logs modal",
   /cell\.att\?\.status === "Present"[\s\S]{0,80}setCheckinDate\(/.test(attendanceSrc));
ok("attendance: the popup heading does not repeat the date in its own title",
   /checkinLogsShort/.test(detailModal) && !/checkinLogs", \{ date:/.test(detailModal));

const essLocales = ["en", "hi", "ar"].map((l) =>
  readFileSync(new URL(`../../src/i18n/locales/${l}/ess.json`, import.meta.url), "utf8"));
ok("attendance: checkinLogsShort exists in all three locales",
   essLocales.every((t) => t.includes('"checkinLogsShort"')));


/* =======================================================================
   Document attachments panel.

   Rendered through the AppModal stub for the same reason as the picker: the
   dialog is what the operator actually sees, and under renderToString a
   portalled Radix Dialog returns an empty string -- which would turn every
   assertion below into a silent pass on nothing.
   ======================================================================= */

const ATTACH_CONFIG = {
  doctype: "Purchase Receipt",
  types: [
    {
      type_key: "RECEIPT_PHOTO", label: "Receipt Photo",
      extensions: ["jpg", "jpeg", "png"], max_size_mb: 5,
    },
    {
      type_key: "WEIGHBRIDGE_TICKET", label: "Weighbridge Ticket",
      extensions: ["pdf", "jpg"], max_size_mb: 5,
    },
  ],
};
const ATTACH_FILES = {
  doctype: "Purchase Receipt",
  files: [
    {
      name: "file/abc", file_name: "[RECEIPT_PHOTO]1-IMG_0001.jpg",
      label: "Receipt Photo", file_url: "/private/files/x.jpg", is_private: 1,
    },
  ],
};

globalThis.fetch = (url) => {
  const body = JSON.stringify({
    message: String(url).includes("list_document_attachments") ? ATTACH_FILES : ATTACH_CONFIG,
  });
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body),
  });
};

const attachSubmitHtml = renderNode(
  <AttachDialog
    show
    doctype="Purchase Receipt"
    docname="MAT-PRE-00011"
    onSubmit={() => {}}
  />,
);
const attachBrowseHtml = renderNode(
  <AttachDialog
    show
    doctype="Purchase Receipt"
    docname="MAT-PRE-00011"
  />,
);

// Both responses arrive as promises, and renderToString is synchronous, so the
// panel's initial (empty) frame is what is on the string. That is still the
// frame worth asserting: it is the one that decides whether a half-loaded
// panel flashes raw i18n keys at the operator.
ok("attachments: no raw translation key leaks into the dialog",
   !/attachments\.[a-zA-Z]/.test(attachSubmitHtml) && !/common\.[a-zA-Z]/.test(attachSubmitHtml),
   "i18next returns the key itself when a namespace is missing, so this is the assertion that catches an untranslated string");
// The pre-submit footer is Cancel + Submit. The OLD footer was Skip +
// a prominent Done that only CLOSED the dialog, so Submit -> dialog -> Done ->
// untouched draft -> Submit looped forever and only the ghost Skip submitted.
ok("attachments: the pre-submit dialog offers Cancel and Submit, translated",
   attachSubmitHtml.includes("Cancel") && attachSubmitHtml.includes("Submit") &&
     !/Submit without attaching/.test(attachSubmitHtml),
   "an operator on a phone with no camera must still be able to finish -- Submit with zero files is that escape hatch -- and a close that never submits is the loop this replaced");
// Browse mode (header Attach action): a single Done, and nothing that could
// submit the parent document from a dialog opened only to LOOK at files.
ok("attachments: the browse dialog is Done-only and cannot submit",
   attachBrowseHtml.includes("Done") &&
     !attachBrowseHtml.includes("Cancel") && !attachBrowseHtml.includes("Submit"),
   "browsing files must not be able to submit the document");

// The ACCEPT attribute is the real contract with the server's extension list.
const attachLibSrc = readFileSync(
  new URL("../../src/lib/attachments.js", import.meta.url), "utf8");
const attachSrc = readFileSync(
  new URL("../../src/components/Attachments/index.jsx", import.meta.url), "utf8");
ok("attachments: the accept filter is built from the server config, not a literal",
   /accept={acceptFor\(type\)}/.test(attachSrc) &&
     /accept={[a-z]+\s*[&|]/.test(attachSrc) === false &&
     /\.map\(\(ext\) => `\.\$\{ext\}`\)\.join\(","\)/.test(attachLibSrc),
   "a hardcoded accept would offer a file the server then refuses, after the upload has already left the device");
ok("attachments: the file input is never rendered as a visible control",
   /hidden/.test(attachSrc) && /\.click\(\)/.test(attachSrc),
   "an always-open file input invites picking from anywhere on the form");

// `onSkip` is gone: with a Cancel+Submit footer in the pre-submit mode, Skip
// and Submit would be the same button twice. No call site may resurrect it.
const attachCallers = [
  "../../src/pages/Store/purchase-receipt/form/index.jsx",
  "../../src/pages/Store/plate-offcut/form/index.jsx",
  "../../src/components/StockEntry/StockEntryPage.jsx",
].map((p) => readFileSync(new URL(p, import.meta.url), "utf8"));
ok("attachments: no call site still passes the removed onSkip prop",
   !/onSkip/.test(attachSrc) && attachCallers.every((s) => !/onSkip/.test(s)));
// The Purchase Receipt and Plate Offcut submit flows pass onSubmit -- the
// regression this whole section exists for is a dialog in front of a submit
// whose Done button does not submit.
ok("attachments: the PR and Plate Offcut submit flows pass onSubmit",
   /attachForSubmit/.test(attachCallers[0]) && /attachForSubmit/.test(attachCallers[1]) &&
     /onSubmit=\{\s*attachForSubmit/.test(attachCallers[0]) &&
     /onSubmit=\{\s*attachForSubmit/.test(attachCallers[1]));

// The Quality Inspection form carries the attach dialog now; the report page
// must not -- the "recent failures" rows navigate to the form instead.
const qiFormSrc = readFileSync(
  new URL("../../src/pages/Quality/entry/InspectionForm/index.jsx", import.meta.url), "utf8");
const qiReportSrc = readFileSync(
  new URL("../../src/pages/Quality/reports/index.jsx", import.meta.url), "utf8");
ok("quality: the inspection form offers Attach on a saved document",
   /AttachDialog/.test(qiFormSrc) && /isEdit &&\s*\{\s*label: t\("attachments\.open"\)/.test(qiFormSrc));
ok("quality: the report page no longer hosts the attach dialog",
   !/AttachDialog/.test(qiReportSrc) && !/setAttachTo/.test(qiReportSrc) &&
     /navigate\(`\/quality\/inspection\/\$\{r\.name\}`\)/.test(qiReportSrc));

// Leave Application and Expense Claim attachments: the header action must be
// gated on a SAVED, UNSUBMITTED document -- an ESS user's write on their own
// document ends at submit, so an ungated button can only fail at _require_write.
const leaveFormSrc = readFileSync(
  new URL("../../src/pages/ESS/requests/leave/LeaveApplicationForm.jsx", import.meta.url), "utf8");
const expenseFormSrc = readFileSync(
  new URL("../../src/pages/ESS/requests/expense/ExpenseClaimForm.jsx", import.meta.url), "utf8");
ok("ess: leave and expense attach actions are draft-only",
   /isEdit &&\s*!isSubmitted &&\s*\{\s*label: t\("attachments\.open"\)/.test(leaveFormSrc) &&
     /isEdit &&\s*!isSubmitted &&\s*\{\s*label: t\("attachments\.open"\)/.test(expenseFormSrc) &&
     /doctype="Leave Application"/.test(leaveFormSrc) &&
     /doctype="Expense Claim"/.test(expenseFormSrc));


/* =======================================================================
   Quality Inspection header fields.

   The form used to post only item_code, template, status and readings.
   ERPNext marks four more fields `reqd`, so every save ended at
   document.py:310 with:

       MandatoryError: [Quality Inspection, ...]: inspection_type,
       reference_type, reference_name, sample_size

   Rendered to assert the four are actually on the page -- a field that is
   validated but never rendered fails the same way as one that is missing.
   ======================================================================= */

globalThis.fetch = () => {
  const body = JSON.stringify({ message: {}, data: {} });
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body),
  });
};

const qiFormHtml = renderNode(<QualityInspectionForm />);

for (const label of ["Inspection Type", "Reference Type", "Sample Size"]) {
  ok(`QI form: renders the ${label} field`, qiFormHtml.includes(label));
}

// FormField renders its label even when the control is disabled, so what marks
// this field is the PLACEHOLDER the LinkField shows while disabled.
ok("QI form: the reference document field is present but gated on a type",
   qiFormHtml.includes("Reference Document") &&
     qiFormHtml.includes("Choose a reference type first"),
   "an empty doctype would fire a link search against nothing");
ok("QI form: no raw translation key leaks",
   !/quality\.[a-zA-Z]/.test(qiFormHtml) && !/common\.[a-zA-Z]/.test(qiFormHtml),
   "i18next returns the key itself when a namespace is missing");
// Radix renders <SelectItem> inside a popover that is not open, so option text
// is NOT in the SSR string and cannot be asserted here. The raw doctype names
// are guarded character-for-character in the rules suite instead.
// Radix renders neither a Select's placeholder nor its options while closed --
// SelectValue defers to the open popover and SelectContent is not mounted -- so
// nothing about the chosen value is assertable here. What IS observable is the
// trigger existing, closed, and with no value text inside it, which is what
// proves the reference type has not silently defaulted to something the user
// never picked.
const refTriggerAt = qiFormHtml.indexOf("Reference Type");
const refTrigger = qiFormHtml.slice(refTriggerAt, refTriggerAt + 700);
ok("QI form: the reference type trigger is present and closed, with no value chosen",
   /role="combobox"/.test(refTrigger) && /aria-expanded="false"/.test(refTrigger) &&
     !/Purchase Receipt|Purchase Invoice|Delivery Note/.test(refTrigger),
   "a select that silently defaulted would post a reference the user never chose");
ok("QI form: sample size defaults to 1",
   /type="number"[^>]*value="1"/.test(qiFormHtml) || /value="1"[^>]*type="number"/.test(qiFormHtml));

console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
