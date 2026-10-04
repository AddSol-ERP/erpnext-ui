import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { get } from "../../services/api";
import { Input } from "@/components/ui/input";
import { linkSearchTerm, MIN_SEARCH_CHARS } from "./searchTerm";

/** Wait this long after the last keystroke before hitting the search API. */
const SEARCH_DEBOUNCE_MS = 300;
export default function LinkField({
  doctype,
  value,
  onChange,
  placeholder,
  disabled = false,
}) {
  const { t } = useTranslation();

  /**
   * The text in the box is LOCAL state and is deliberately not pushed to the
   * parent on every keystroke.
   *
   * Consumers hang chained effects off `onChange` -- the request forms fetch
   * named approvers, the employee's company, and so on whenever the employee
   * changes. The old implementation called `onChange(txt)` from the input's
   * onChange handler, so every character of "HR-EMP-00002" fired a round of
   * those chained API calls, and the document ended up holding whatever
   * partial text happened to be typed. `onChange` now fires only when a value
   * is genuinely committed: an option is picked, the box is cleared, or the
   * text is blurred and exactly matches a known option.
   */
  const [query, setQuery] = useState(value || "");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({});

  const inputRef = useRef(null);
  const searchTimeout = useRef(null);
  /** Monotonic id so out-of-order responses cannot overwrite newer results. */
  const requestId = useRef(0);
  /** Last `txt` we actually loaded options for, to avoid refetching on refocus. */
  const lastFetched = useRef(null);

  // Adopt a value the parent changed on its own: an auto-filled employee, a
  // reset after switching employee, or a document loaded in edit mode.
  // The compiler rule flags any setState reached from an effect; this is the
  // documented "reset state when a prop changes" case and cannot move to an
  // event handler, because the change originates above us.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(value || "");
  }, [value]);

  // Cancel the pending debounce and invalidate in-flight requests on unmount,
  // otherwise a slow response calls setState on an unmounted component.
  useEffect(() => {
    return () => {
      clearTimeout(searchTimeout.current);
      requestId.current += 1;
    };
  }, []);

  /* ===============================
     POSITION CALCULATION
  =============================== */
  const updatePosition = () => {
    if (!inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();

    // The dropdown is `position: fixed`, so it has to be positioned with
    // viewport coordinates. getBoundingClientRect() already returns those --
    // adding window.scrollX/scrollY would shift the dropdown by the current
    // page scroll offset and detach it from the input.
    setPosition({
      top: rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (show) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [show]);

  /* ===============================
     SEARCH
  =============================== */
  const runSearch = (txt) => {
    const id = ++requestId.current;
    setLoading(true);

    return get("method/frappe.desk.search.search_link", {
      doctype,
      txt,
      page_length: 10,
    })
      .then((res) => {
        // A newer search has already started -- discard this stale response.
        if (id !== requestId.current) return;
        setOptions(res.message || []);
        lastFetched.current = txt;
      })
      .catch(() => {
        if (id === requestId.current) setOptions([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  };

  /**
   * Load the option list for a query.
   *
   * A query shorter than MIN_SEARCH_CHARS is not a useful search term, and
   * Frappe answers an empty `txt` with the Link field's default list. So a
   * short query has to LOAD that default list, not clear the dropdown: backspacing
   * out of a search used to leave the list empty with no way to get it back
   * except blurring and refocusing the box.
   */
  const loadOptions = (txt) => {
    runSearch(linkSearchTerm(txt));
  };

  /** Cancel anything pending, then debounce a new search. */
  const scheduleSearch = (txt) => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(
      () => loadOptions(txt),
      SEARCH_DEBOUNCE_MS,
    );
  };

  /* ===============================
     COMMIT -- the only path that notifies the parent
  =============================== */
  const commit = (next) => {
    setShow(false);
    clearTimeout(searchTimeout.current);
    requestId.current += 1;
    setLoading(false);
    // Reflect the committed value straight away; the parent's state update (and
    // the effect above) confirms it a tick later.
    setQuery(next);

    // Re-picking the current value must not fire the parent's chained effects
    // again (refetching approvers/company for a value that did not change).
    if (next === (value || "")) return;

    onChange(next);
  };

  /* ===============================
     INPUT EVENTS
  =============================== */
  const handleSearch = (txt) => {
    if (disabled) return;

    setQuery(txt);
    setShow(true);

    // An explicit clear is a real change: tell the parent so a Save cannot
    // silently submit the old value while the box looks empty.
    if (!txt) {
      if (value) onChange("");

      // Restore the default option list. Clearing must not leave the dropdown
      // empty -- that is the state backspacing out of a search lands in.
      clearTimeout(searchTimeout.current);
      loadOptions("");
      return;
    }

    // Typing: local state + debounced search only. No chained events.
    scheduleSearch(txt);
  };

  const handleFocus = () => {
    if (!doctype || disabled) return;

    setShow(true);
    const txt = (query || "").trim();

    // Don't re-issue the same request every time the field regains focus.
    if (lastFetched.current === txt) return;

    clearTimeout(searchTimeout.current);
    loadOptions(txt);
  };

  const handleBlur = () => {
    // Small delay so a click on an option is delivered before we tear down.
    setTimeout(() => {
      setShow(false);
      clearTimeout(searchTimeout.current);

      const txt = (query || "").trim();
      if (!txt || txt === (value || "")) return;

      const exact = options.find(
        (o) =>
          o.value === txt ||
          String(o.value).toLowerCase() === txt.toLowerCase(),
      );

      if (exact) {
        commit(exact.value);
      } else {
        // Not a real link value -- roll the box back to what is actually
        // stored so partial text never masquerades as a selection.
        setQuery(value || "");
      }
    }, 200);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setShow(false);
      return;
    }

    if (e.key === "Enter") {
      if (show && options.length) {
        // Stop the surrounding <form> from submitting on Enter.
        e.preventDefault();
        commit(options[0].value);
      }
    }
  };

  /* ===============================
     DROPDOWN UI (PORTAL)
  =============================== */
  const dropdown =
    show &&
    createPortal(
      <div
        className="pointer-events-auto fixed z-[2000] max-h-72 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
        }}
      >
        {/* LOADING */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}

        {/* OPTIONS */}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-start transition-colors hover:bg-accent hover:text-accent-foreground"
              // Keep focus on the input so its blur handler cannot close the
              // dropdown before this click is delivered.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(opt.value)}
            >
              <span className="text-sm font-medium">{opt.value}</span>
              {opt.description && (
                <span className="truncate text-xs text-muted-foreground">
                  {opt.description}
                </span>
              )}
            </button>
          ))}

        {/* EMPTY -- only once there is enough text to have searched */}
        {!loading &&
          options.length === 0 &&
          query.trim().length >= MIN_SEARCH_CHARS && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {t("common.noResults")}
          </div>
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled}
          role="combobox"
          aria-expanded={show}
          aria-autocomplete="list"
        />
      </div>

      {dropdown}
    </>
  );
}
