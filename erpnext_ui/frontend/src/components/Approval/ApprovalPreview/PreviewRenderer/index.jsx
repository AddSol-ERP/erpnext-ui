import { useEffect, useState } from "react";
// import { get } from "../../../services/api";

import PurchaseOrderPreview from "./types/PurchaseOrderPreview";
import ExpensePreview from "./types/ExpensePreview";
import LeavePreview from "./types/LeavePreview";
import DefaultPreview from "./types/DefaultPreview";
import { get } from "../../../../services/api";
import QuotationPreview from "./types/QuotationPreview";
import OvertimeLogPreview from "./types/OvertimeLogPreview";

const PREVIEW_MAP = {
  "Purchase Order": PurchaseOrderPreview,
  "Expense Claim": ExpensePreview,
  "Leave Application": LeavePreview,
  Quotation: QuotationPreview,
  "Overtime Log": OvertimeLogPreview,
};

export default function PreviewRenderer({ doctype, doc }) {
  const [fullDoc, setFullDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  const Component = PREVIEW_MAP[doctype] || DefaultPreview;

  useEffect(() => {
    if (!doc?.name) return;

    loadDoc();
  }, [doctype, doc?.name]);

  const loadDoc = async () => {
    try {
      setLoading(true);

      const res = await get(`resource/${doctype}/${doc.name}`);
      setFullDoc(res.data);
    } catch (e) {
      console.error("Preview load failed", e);
      setFullDoc(null); // fallback
    } finally {
      setLoading(false);
    }
  };
  console.log(fullDoc, "fullDocv", loading);

  if (loading || !fullDoc) {
    return <div className="text-center p-4 text-muted">Loading preview...</div>;
  }

  return <Component doc={fullDoc} />;
}
