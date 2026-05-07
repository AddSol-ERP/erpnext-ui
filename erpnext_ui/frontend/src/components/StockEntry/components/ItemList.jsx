import ItemRow from "./ItemRow";

export default function ItemList({ items, updateQty, removeItem, updateUOM }) {
  if (!items.length) {
    return <div className="list-empty">No items added</div>;
  }

  return (
    <div className="list-container">
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
