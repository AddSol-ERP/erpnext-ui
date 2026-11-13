import { useTranslation } from "react-i18next";
import useEsslImportAccess from "../hooks/useEsslImportAccess";

export default function RequireEsslImportAccess({ children }) {
  const access = useEsslImportAccess();
  const { t } = useTranslation();
  if (access.loading) return null;
  if (!access.allowed) return <p className="p-6 text-muted-foreground">{t("esslImport.noAccess")}</p>;
  return children;
}
