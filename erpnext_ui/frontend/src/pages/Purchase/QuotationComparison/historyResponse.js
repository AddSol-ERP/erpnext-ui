/** Accept both the original unpaginated API and the current paginated API. */
export function normalizeHistoryResponse(data) {
  if (Array.isArray(data)) return { entries: data, next_start: null };
  if (data && typeof data === "object" && Array.isArray(data.entries)) {
    const next = data.next_start;
    if (next != null && (!Number.isInteger(next) || next < 0)) {
      throw new Error("The saved comparisons response has an invalid page position.");
    }
    return { entries: data.entries, next_start: next ?? null };
  }
  throw new Error("The server returned an unexpected saved comparisons response.");
}
