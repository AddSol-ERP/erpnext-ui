import "./domShim.js";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HeaderProvider } from "@/context/HeaderContext";
import { RoleProvider } from "@/context/RoleContext";
import { ToastProvider } from "@/context/ToastContext";
import i18n from "@/i18n/index.js";

import LeaveApplicationForm from "@/pages/requests/leave/LeaveApplicationForm";
import AttendanceRequestForm from "@/pages/requests/attendance/AttendanceRequestForm";
import ExpenseClaimForm from "@/pages/requests/expense/ExpenseClaimForm";
import GenericForm from "@/components/GenericForm/index.jsx";
import { DocStatusField } from "@/components/DocStatusField";
import { statusTone } from "@/components/List/statusTones";

// Effects do not run under renderToString, so nothing should fetch here.
globalThis.fetch = () => {
  throw new Error("unexpected fetch during render");
};

const FORMS = [
  { label: "Leave Application", path: "/requests/leave", C: LeaveApplicationForm },
  { label: "Attendance Request", path: "/requests/attendance", C: AttendanceRequestForm },
  { label: "Expense Claim", path: "/requests/expense", C: ExpenseClaimForm },
  { label: "GenericForm", path: "/g/purchase-order/new", C: GenericForm },
];

let fail = 0;
for (const { label, path, C } of FORMS) {
  for (const [mode, route] of [
    ["new", path],
    ["existing", `${path}/TEST-0001`],
    ["generic-new", "/g/purchase-order/new"],
  ]) {
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

console.log(fail ? `\n${fail} render failure(s)` : "\nall forms render");
process.exit(fail ? 1 : 0);
