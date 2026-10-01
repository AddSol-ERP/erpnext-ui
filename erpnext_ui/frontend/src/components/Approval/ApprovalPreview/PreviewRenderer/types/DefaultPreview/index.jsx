import { useTranslation } from "react-i18next";
import { BasePreview } from "..";

export default function DefaultPreview({ doc }) {
  const { t } = useTranslation();

  return (
    <BasePreview title={doc.name} meta={t("approvals.preview.genericView")}>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">
        {JSON.stringify(doc, null, 2)}
      </pre>
    </BasePreview>
  );
}
