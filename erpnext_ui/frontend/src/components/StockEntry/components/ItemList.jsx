import { useTranslation } from "react-i18next";
import ItemRow from "./ItemRow";

export default function ItemList({ items, updateQty, removeItem, updateUOM }) {
  const { t } = useTranslation();

  if (!items.length) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {t("store.item.emptyList")}
      </div>
    );
  }

  return (
    <div className="card-stack flex flex-col gap-2">
      {items.map((item) => (
        <ItemRow
          key={item.code}
          item={item}
          updateQty={updateQty}
          updateUOM={updateUOM}
          removeItem={removeItem}
        />
      ))}
    </div>
  );
}
