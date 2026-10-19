/**
 * Option normalisation for FormSelect.
 *
 * Extracted from the component and exported so it can be ASSERTED rather than
 * eyeballed. The bug this exists to prevent is entirely silent: passing bare
 * strings used to be accepted and rendered N blank options, because the mapper
 * was `Array.isArray(opt) ? {value: opt[0], label: opt[1]} : opt`, which left a
 * string as a string -- and the render then read `opt.value` and `opt.label`
 * off it, both `undefined`. Every item got `value="undefined"`, no text, and a
 * duplicate React key. No throw, no console output, just an empty dropdown.
 *
 * It reached production because a dropdown's options are not in the server-
 * rendered string at all: Radix renders `SelectItem`s only inside a popover
 * that is closed, so an SSR render sees the trigger and nothing else. A test
 * that renders the form could not have caught it -- only this can.
 *
 * Accepted per item, and they may be mixed:
 *   "Purchase Receipt"                     bare string
 *   ["v", "Label"]                         [value, label] tuple
 *   { value: "v", label: "Label" }         object
 */
export function toSelectItems(options = []) {
  if (!Array.isArray(options)) return [];

  return options
    .map((opt) => {
      if (typeof opt === "string") return { value: opt, label: opt };
      if (Array.isArray(opt)) return { value: opt[0], label: opt[1] };
      if (opt && typeof opt === "object") return { value: opt.value, label: opt.label };
      return null;
    })
    // An empty or missing value is dropped rather than rendered. Radix forbids
    // the empty string on a SelectItem, and several entries sharing one
    // `undefined` value is exactly the failure being fixed here.
    .filter((item) => item && item.value !== "" && item.value != null)
    .map((item) => ({
      value: String(item.value),
      // Fall back to the value when a label is missing, so a tuple that forgot
      // its second element still reads as text rather than a blank row.
      label: item.label == null || item.label === "" ? String(item.value) : item.label,
    }));
}