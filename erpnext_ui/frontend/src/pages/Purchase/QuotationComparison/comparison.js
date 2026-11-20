/** Group exact item codes; duplicates remain visible and are never ranked. */
export function buildItemRows(quotations) {
  const rows = new Map();
  quotations.forEach((quote, index) => {
    (quote.items || []).forEach((item, line) => {
      const key = item.item_code ? `item:${item.item_code}` : `missing:${index}:${line}`;
      if (!rows.has(key)) rows.set(key, { key, code: item.item_code, name: item.item_name, offers: quotations.map(() => []) });
      rows.get(key).offers[index].push(item);
    });
  });
  return [...rows.values()].map((row) => {
    const available = row.offers.map((items, index) => ({ items, quote: quotations[index] })).filter(({ items }) => items.length);
    const comparable = available.length >= 2 && available.every(({ items, quote }) =>
      items.length === 1 && quote.currency && items[0].uom && Number.isFinite(Number(items[0].qty)) && Number(items[0].qty) > 0 && items[0].rate != null && items[0].rate !== "" && Number.isFinite(Number(items[0].rate)) && Number(items[0].rate) > 0 &&
      quote.currency === available[0].quote.currency && items[0].uom === available[0].items[0].uom && Number(items[0].qty) === Number(available[0].items[0].qty));
    return { ...row, lowestRate: comparable ? Math.min(...available.map(({ items }) => Number(items[0].rate))) : null };
  });
}
