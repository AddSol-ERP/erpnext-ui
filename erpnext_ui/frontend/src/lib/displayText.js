export function plainText(value) {
  if (typeof value !== "string") return value == null ? "" : String(value);

  const text =
    typeof DOMParser !== "undefined"
      ? new DOMParser().parseFromString(value, "text/html").body.textContent || ""
      : value.replace(/<[^>]*>/g, " ");

  return text.replace(/\s+/g, " ").trim();
}

export function shortenText(value, maxLength) {
  const text = String(value ?? "");
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
