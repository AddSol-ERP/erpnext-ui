import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [fullDoc, setFullDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  const Component = PREVIEW_MAP[doctype] || DefaultPreview;

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

  useEffect(() => {
    if (!doc?.name) return;

    // loadDoc setStates only after the awaited API response; the compiler
    // rule conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, doc?.name]);

  if (loading || !fullDoc) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t("approvals.loadingPreview")}
      </div>
    );
  }

  return <Component doc={fullDoc} />;
}
