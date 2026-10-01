/**
 * Shared helpers for list filter chips + ActionBar filter handlers.
 */

/** Resolve a select option label from filter config (if any). */
function resolveOptionLabel(def, value) {
  if (!def || def.type !== "select" || !def.options) return value;
  const opt = def.options.find((o) => {
    const v = typeof o === "object" ? o.value : o;
    return String(v) === String(value);
  });
  if (opt == null) return value;
  return typeof opt === "object" ? opt.label : opt;
}

/**
 * Build removable chip descriptors from active filters + config.
 * @returns [{ id, label, value, onRemove }]
 */
export function buildFilterChips({
  selectedFilters = {},
  filterConfig = null,
  onRemoveFilter,
}) {
  const defs = filterConfig?.filters || [];

  return Object.entries(selectedFilters)
    .filter(([, v]) => v != null && v !== "")
    .map(([field, value]) => {
      const def = defs.find((f) => f.field === field);
      return {
        id: field,
        label: def?.label || field,
        value: resolveOptionLabel(def, value),
        onRemove: onRemoveFilter ? () => onRemoveFilter(field) : undefined,
      };
    });
}

/**
 * Standard ActionBar filter callback bundle for list pages.
 * Batches apply/remove/clear against parent state + pagination reset.
 */
export function listFilterHandlers(setFilters, resetPage) {
  return {
    onApplyFilters: (filters) => {
      setFilters(filters);
      resetPage();
    },
    onRemoveFilter: (field) => {
      setFilters((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      resetPage();
    },
    onClearFilters: () => {
      setFilters({});
      resetPage();
    },
  };
}
