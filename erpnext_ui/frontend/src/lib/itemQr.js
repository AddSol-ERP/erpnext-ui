/** Preserve tracked identity while collecting physical labels for one Item row. */
export function mergeScannedItem(items, scan, warehouse) {
  if (!scan.item_code || !scan.stock_uom || !(Number(scan.qty) > 0)) throw new Error("qr.invalid");
  if (scan.serial_no && (!scan.warehouse || scan.warehouse !== warehouse)) throw new Error("qr.warehouseMismatch");
  const existing = items.find(row => row.code === scan.item_code);
  if (existing?.qr_labels?.includes(scan.label_id) || (scan.serial_no && existing?.serial_no?.split("\n").includes(scan.serial_no))) throw new Error("qr.duplicate");
  if (existing?.qr_labels?.length && (existing.batch_no || "") !== (scan.batch_no || "")) throw new Error("qr.batchMismatch");
  // An indent supplies planned quantity. Once scanning starts the issued
  // quantity is the units actually scanned, while its request links survive.
  const previous = existing?.qr_labels?.length ? existing : null;
  const row = {
    ...(existing || {}), code: scan.item_code, name: scan.item_name,
    uom: scan.stock_uom, stockUOM: scan.stock_uom, conversionFactor: 1,
    uomOptions: [scan.stock_uom], qty: Number(previous?.qty || 0) + Number(scan.qty),
    batch_no: scan.batch_no || "", serial_no: [previous?.serial_no, scan.serial_no].filter(Boolean).join("\n"),
    qr_labels: [...(previous?.qr_labels || []), scan.label_id], stockMode: "strict",
  };
  return existing ? items.map(item => item.code === row.code ? row : item) : [...items, row];
}

export function scannedTrackingFields(row) {
  if (!row.qr_labels?.length) return {};
  return { use_serial_batch_fields: row.serial_no || row.batch_no ? 1 : 0,
    serial_no: row.serial_no || undefined, batch_no: row.batch_no || undefined };
}
