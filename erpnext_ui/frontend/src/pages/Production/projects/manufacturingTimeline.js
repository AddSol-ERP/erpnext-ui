export const stamp = (value) => value ? new Date(value.replace(" ", "T")).getTime() : NaN;
export function timelineRows(orders, cards, now) {
  return orders.flatMap((order) => [{ ...order, kind: "order", start: order.planned_start_date,
    end: order.planned_end_date, actualStart: order.actual_start_date, actualEnd: order.actual_end_date,
    minutes: (order.operations || []).reduce((n, r) => n + Number(r.actual_operation_time || 0), 0),
    progress: Number(order.qty) > 0 ? Math.min(100, 100 * Number(order.produced_qty || 0) / Number(order.qty)) : 0 },
  ...cards.filter((card) => card.work_order === order.name).map((card) => {
    const logs = card.time_logs || [];
    const starts = logs.map((r) => r.from_time).filter(Boolean).sort();
    const ends = logs.map((r) => r.to_time).filter(Boolean).sort();
    const running = logs.some((r) => r.from_time && !r.to_time);
    return { ...card, kind: "job", start: card.expected_start_date, end: card.expected_end_date,
      actualStart: starts[0], actualEnd: running ? new Date(now).toISOString() : ends.at(-1),
      minutes: Number(card.total_time_in_mins || 0) + logs.filter((r) => r.from_time && !r.to_time)
        .reduce((n, r) => n + Math.max(0, (now - stamp(r.from_time)) / 60000), 0),
      progress: Number(card.for_quantity) > 0 ? Math.min(100, 100 * Number(card.total_completed_qty || 0) / Number(card.for_quantity)) : 0 };
  })]);
}
