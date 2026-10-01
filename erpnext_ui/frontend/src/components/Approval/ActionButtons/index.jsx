import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// `doc` is part of the public props API (callers pass the document) even
// though the buttons are not wired to handlers yet.
// eslint-disable-next-line no-unused-vars
export function ActionButtons({ doc }) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
      <Button variant="destructive">{t("approvals.reject")}</Button>
      <Button className="bg-emerald-600 text-white hover:bg-emerald-600/85">
        {t("approvals.approve")}
      </Button>
    </div>
  );
}
