import assert from "node:assert/strict";
import { timelineRows } from "../erpnext_ui/frontend/src/pages/Production/projects/manufacturingTimeline.js";
const now = new Date("2026-11-17T10:30:00").getTime();
const orders = [{ name: "WO-1", qty: 10, produced_qty: 4, operations: [{ actual_operation_time: 12 }] }, { name: "WO-2", qty: 0 }];
const cards = [{ name: "JC-1", work_order: "WO-1", for_quantity: 10, total_completed_qty: 3, total_time_in_mins: 15,
  time_logs: [{ from_time: "2026-11-17 10:00:00", to_time: "2026-11-17 10:15:00" }, { from_time: "2026-11-17 10:20:00" }] },
 { name: "JC-2", work_order: "WO-2", for_quantity: 0 }, { name: "OTHER", work_order: "WO-OTHER" }];
const rows = timelineRows(orders, cards, now);
assert.deepEqual(rows.map((r) => r.name), ["WO-1", "JC-1", "WO-2", "JC-2"]);
assert.equal(rows[0].progress, 40);
assert.equal(rows[0].minutes, 12);
assert.equal(rows[1].progress, 30);
assert.equal(rows[1].minutes, 25);
assert.equal(rows[1].actualStart, "2026-11-17 10:00:00");
assert.equal(new Date(rows[1].actualEnd).getTime(), now);
assert.equal(rows[2].progress, 0);
assert.equal(rows[3].progress, 0);
assert.equal(timelineRows([], cards, now).length, 0);
console.log("Manufacturing timeline checks passed");
