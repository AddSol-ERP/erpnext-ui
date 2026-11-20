import PurchaseOrderPreview from "./types/PurchaseOrderPreview";
import ExpensePreview from "./types/ExpensePreview";
import LeavePreview from "./types/LeavePreview";
import DefaultPreview from "./types/DefaultPreview";
import QuotationPreview from "./types/QuotationPreview";
import OvertimeLogPreview from "./types/OvertimeLogPreview";
import AttendanceRequestPreview from "./types/AttendanceRequestPreview";

const PREVIEW_MAP = {
  "Purchase Order": PurchaseOrderPreview,
  "Expense Claim": ExpensePreview,
  "Leave Application": LeavePreview,
  "Attendance Request": AttendanceRequestPreview,
  Quotation: QuotationPreview,
  "Overtime Log": OvertimeLogPreview,
};

/**
 * Picks the right preview for a doctype.
 *
 * The full document is fetched by `ApprovalPreview`, NOT here: the raw
 * "Details" view needs the same document, and fetching in both places meant two
 * requests for one modal (and left Details rendering the projected list row).
 * `doc` here is therefore always the complete record, with items, taxes,
 * payment schedule, addresses and terms.
 */
export default function PreviewRenderer({ doctype, doc }) {
  const Component = PREVIEW_MAP[doctype] || DefaultPreview;

  return <Component doc={doc} />;
}
