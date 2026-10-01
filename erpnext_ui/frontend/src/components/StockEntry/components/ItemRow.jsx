import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2 } from "lucide-react";
import FormSelect from "../../FormSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ItemRow({ item, updateQty, removeItem, updateUOM }) {
  const { t } = useTranslation();

  const available = (item.stockQty || 0) - (item.reservedQty || 0);
  const isOver = item.qty > available;
  const isLow = available > 0 && item.qty > available * 0.7;

  const getStockClass = () => {
    if (available <= 0) return "text-destructive";
    if (isOver) return "text-destructive";
    if (isLow) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  const getStatusText = () => {
    if (available <= 0) return t("store.item.outOfStock");
    if (isOver) return t("store.item.exceedsStock");
    if (isLow) return t("store.item.lowStock");
    return t("store.item.available");
  };

  return (
    <div className="flex flex-col gap-3 rounded-none bg-card px-4 py-3 ring-1 ring-foreground/10 md:flex-row md:items-center">
      {/* MAIN */}
      <div className="min-w-0 md:flex-grow">
        <div className="truncate text-sm font-medium text-foreground">
          {item.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {item.code}
        </div>
      </div>

      {/* STOCK INFO */}
      <div className="text-start text-xs md:min-w-36">
        <div className={`font-semibold ${getStockClass()}`}>
          {available} {item.stockUOM || item.uom}
        </div>

        <div className="text-muted-foreground">{getStatusText()}</div>

        {item.stockMode === "strict" && (
          <>
            {available <= 0 && (
              <div className="text-destructive">
                {t("store.item.willBeRemoved")}
              </div>
            )}

            {available > 0 && isOver && (
              <div className="text-amber-600 dark:text-amber-400">
                {t("store.item.willAdjust", { qty: available })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => updateQty(item.code, item.qty - 1)}
          aria-label={t("store.item.decrease")}
        >
          <Minus />
        </Button>

        <Input
          type="number"
          className="w-16"
          value={item.qty}
          onChange={(e) => updateQty(item.code, e.target.value)}
        />

        <FormSelect
          className="h-8 w-20"
          value={item.uom}
          onChange={(v) => updateUOM(item.code, v)}
          options={(item.uomOptions || ["Nos"]).map((u) => ({
            value: u,
            label: u,
          }))}
        />

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => updateQty(item.code, item.qty + 1)}
          aria-label={t("store.item.increase")}
        >
          <Plus />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeItem(item.code)}
          aria-label={t("store.item.remove")}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
