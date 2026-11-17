import { useParams } from "react-router-dom";
import RequireReportAccess from "../../../components/RequireReportAccess";

// A typed hash URL must not turn this hub into an arbitrary DocType editor.
export default function DocumentGuard({ children }) {
  const { doctype } = useParams();
  if (doctype && !["Project", "BOM", "Production Plan", "Work Order", "Stock Entry"].includes(doctype)) return null;
  return <RequireReportAccess reportKey="manufacturing">{children}</RequireReportAccess>;
}
