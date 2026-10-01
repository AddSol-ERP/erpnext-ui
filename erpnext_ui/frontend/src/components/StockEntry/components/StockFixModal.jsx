import { useTranslation } from "react-i18next";
import AppModal from "../../AppModal";
import { Button } from "@/components/ui/button";

function StockFixModal({ show, onClose, invalidItems, onRemove, onAdjust }) {
  const { t } = useTranslation();

  return (
    <AppModal show={show} onClose={onClose} title={t("store.fix.title")}>
      <div className="mb-3 text-sm">
        {t("store.fix.outOfStock", { count: invalidItems.length })}
      </div>

      <div className="mb-3 text-xs text-muted-foreground">
        {invalidItems.slice(0, 5).map((i) => (
          <div key={i.code}>{i.code}</div>
        ))}
        {invalidItems.length > 5 && (
          <div>{t("store.fix.more", { n: invalidItems.length - 5 })}</div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="w-full"
          onClick={onRemove}
        >
          {t("store.fix.removeItems")}
        </Button>

        <Button
          className="w-full bg-amber-600 text-white hover:bg-amber-600/85"
          onClick={onAdjust}
        >
          {t("store.fix.adjustQty")}
        </Button>
      </div>
    </AppModal>
  );
}

export default StockFixModal;
