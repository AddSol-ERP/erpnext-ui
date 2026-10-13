/**
 * Local date/time strings for posting date and time inputs.
 *
 * These deliberately do NOT use `toISOString()`. That returns UTC, so a store in
 * IST (UTC+5:30) entering an entry between midnight and 05:30 local would get
 * *yesterday's* date. A posting date is what the person saw on their own
 * calendar, so it has to be built from local parts.
 */

/** Today, as `YYYY-MM-DD`, in the browser's local timezone. */
export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Now, as `HH:MM`, in the browser's local timezone — what `<input type="time">` wants. */
export function localTimeHHMM(date = new Date()) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default localDateISO;