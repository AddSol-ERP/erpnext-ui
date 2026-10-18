import "./domShim.js";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HeaderProvider } from "@/context/HeaderContext";
import { RoleProvider } from "@/context/RoleContext";
import { ToastProvider } from "@/context/ToastContext";
import i18n from "@/i18n/index.js";

import LeaveApplicationForm from "@/pages/ESS/requests/leave/LeaveApplicationForm";
import AttendanceRequestForm from "@/pages/ESS/requests/attendance/AttendanceRequestForm";
import ExpenseClaimForm from "@/pages/ESS/requests/expense/ExpenseClaimForm";
import GenericForm from "@/components/GenericForm/index.jsx";
import EmployeeDocuments from "@/pages/ESS/EmployeeDocuments";
import { DocStatusField } from "@/components/DocStatusField";
import { statusTone } from "@/components/List/statusTones";
// These two are the only SPA forms the stock harness did NOT render, and both
// bugs below shipped past every suite in this directory: `../../../../services/api`
// resolved one directory too high, and FormField was imported as a default when
// it is a named export. Neither ESLint (no import resolver is configured) nor
// rules.jsx nor storecheck.jsx could see either one -- they only surface when a
// module is actually pulled into the production graph and rendered. Rendering
// them here is the cheapest place to catch a fourth.
//
// Note the form's body only renders because a new document seeds its initial
// state instead of starting on a spinner that never clears without an effect;
// that took the render from 650 to ~15k chars.
import PlateOffcutForm from "@/pages/Store/plate-offcut/form/index.jsx";
import PlateOffcutList from "@/pages/Store/plate-offcut/index.jsx";

// Effects do not run under renderToString, so nothing should fetch here.
globalThis.fetch = () => {
  throw new Error("unexpected fetch during render");
};

const FORMS = [
  { label: "Leave Application", path: "/requests/leave", C: LeaveApplicationForm },
  { label: "Attendance Request", path: "/requests/attendance", C: AttendanceRequestForm },
  { label: "Expense Claim", path: "/requests/expense", C: ExpenseClaimForm },
  { label: "GenericForm", path: "/g/purchase-order/new", C: GenericForm },
  { label: "Plate Offcut", path: "/store/plate-offcut/new", C: PlateOffcutForm },
  // Every tab, not just the default. The hub picks ONE panel from the `?tab=`
  // query param and only that panel mounts -- which is the right behaviour and
  // also meant the two non-default panels were never rendered here at all. A
  // `<Plus />` with no import reached main that way: ESLint's `no-undef` does not
  // resolve JSX element names, and rolldown does not error on an undefined
  // global, so the only thing that can catch it is actually rendering it.
  { label: "Plate Offcut tab: available", path: "/store/plate-offcut", entry: "/store/plate-offcut?tab=available", C: PlateOffcutList, only: true },
  { label: "Plate Offcut tab: stock", path: "/store/plate-offcut", entry: "/store/plate-offcut?tab=stock", C: PlateOffcutList, only: true },
  { label: "Plate Offcut tab: jobs", path: "/store/plate-offcut", entry: "/store/plate-offcut?tab=jobs", C: PlateOffcutList, only: true },
  // An unrecognised tab must fall back to a real panel rather than render
  // nothing. The hub validates with TABS.includes(raw), and this is the case
  // that proves the fallback is a panel and not undefined.
  { label: "Plate Offcut tab: invalid", path: "/store/plate-offcut", entry: "/store/plate-offcut?tab=nope", C: PlateOffcutList, only: true },
];

let fail = 0;
for (const { label, path, entry, only, C } of FORMS) {
  // `only` renders just the bare URL: an entry that addresses itself with a
  // query string has no /:name route, and appending one puts it after the "?",
  // where it becomes part of the parameter value rather than the path.
  const MODES = only
    ? [["new", entry]]
    : [["new", entry || path], ["existing", `${path}/TEST-0001`], ["generic-new", "/g/purchase-order/new"]];
  for (const [mode, route] of MODES) {
    if (label !== "GenericForm" && mode === "generic-new") continue;
    try {
      // RoleProvider is mounted app-wide in main.jsx, so mirror it here: forms
      // that read the current user (Leave approval gating) need it present.
      const html = renderToString(
        <I18nextProvider i18n={i18n}>
          <RoleProvider>
            <MemoryRouter initialEntries={[route]}>
              <ToastProvider>
                <HeaderProvider>
                  <Routes>
                    <Route path={path} element={<C />} />
                    <Route path={`${path}/:name`} element={<C />} />
                    <Route path="/g/:hub/:doctype/:name" element={<C />} />
                  </Routes>
                </HeaderProvider>
              </ToastProvider>
            </MemoryRouter>
          </RoleProvider>
        </I18nextProvider>,
      );
      console.log(`  PASS  ${label} (${mode}) -> ${html.length} chars`);
      if (process.env.DUMP && label === process.env.DUMP) console.log(html);
    } catch (e) {
      fail++;
      console.log(`  FAIL  ${label} (${mode}) ${e.constructor.name}: ${e.message}`);
    }
  }
}

/* ---------- DocStatusField: the status a request form displays ---------- */
for (const [label, value, expectText] of [
  ["resolved status", { label: "Approved", tone: statusTone("Approved") }, "Approved"],
  ["workflow state", { label: "Pending Approval", tone: statusTone("Pending Approval") }, "Pending Approval"],
  ["rejected", { label: "Rejected", tone: statusTone("Rejected") }, "Rejected"],
]) {
  try {
    const html = renderToString(
      <I18nextProvider i18n={i18n}>
        <DocStatusField label="Status" status={value} />
      </I18nextProvider>,
    );
    if (!html.includes(expectText)) throw new Error(`missing ${expectText}`);
    console.log(`  PASS  DocStatusField (${label}) -> ${expectText}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL  DocStatusField (${label}) ${e.message}`);
  }
}

// No status resolved yet: must still render a label and read "Draft", never blank.
try {
  const html = renderToString(
    <I18nextProvider i18n={i18n}>
      <DocStatusField label="Status" status={null} />
    </I18nextProvider>,
  );
  if (!html.includes("Status")) throw new Error("label missing");
  if (!html.includes("Draft")) throw new Error("draft fallback missing");
  console.log("  PASS  DocStatusField (no status) -> Draft");
} catch (e) {
  fail++;
  console.log(`  FAIL  DocStatusField (no status) ${e.message}`);
}

/* ---------- EmployeeDocuments: ESS profile documents modal body ---------- */
// Effects do not run under renderToString, so this exercises the initial
// (loading) render only. That is still worth pinning: it proves the component
// mounts without throwing, that its ref callbacks and hidden file inputs are
// valid, and that nothing reaches the network synchronously.
//
// EmployeeDocuments is rendered STANDALONE, not inside AppModal. AppModal is
// built on Radix Dialog, whose DialogPortal calls createPortal(document.body);
// under renderToString with no real DOM that yields an EMPTY string, so a
// dialog-wrapped component cannot be smoke-rendered at all. Wrapping it here
// would make this case pass for the wrong reason (0 chars, no assertions
// reached) while looking green.
try {
  const html = renderToString(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <EmployeeDocuments />
      </ToastProvider>
    </I18nextProvider>,
  );
  if (!html.length) throw new Error("rendered nothing");
  // Assert the RESOLVED English text, not the raw i18n key: the harness has
  // real resources loaded, so a raw-key check would not prove the key resolves.
  if (!html.includes(i18n.t("ess.profile.documents.description"))) {
    throw new Error("documents intro missing");
  }
  if (!html.includes(i18n.t("ess.profile.documents.loading"))) {
    throw new Error("loading state missing");
  }
  console.log(`  PASS  EmployeeDocuments (body) -> ${html.length} chars`);
} catch (e) {
  fail++;
  console.log(`  FAIL  EmployeeDocuments (body) ${e.constructor.name}: ${e.message}`);
}

console.log(fail ? `\n${fail} render failure(s)` : "\nall forms render");
process.exit(fail ? 1 : 0);
