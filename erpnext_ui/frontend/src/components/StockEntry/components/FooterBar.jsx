import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function FooterBar({ totalQty, submit }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 rounded-none bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="text-sm">
        {t("store.entry.totalQty")}:{" "}
        <strong className="tabular-nums">{totalQty}</strong>
      </div>

      <Button onClick={submit}>{t("store.entry.submitEntry")}</Button>
    </div>
  );
}
