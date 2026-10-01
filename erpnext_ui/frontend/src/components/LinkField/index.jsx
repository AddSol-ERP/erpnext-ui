import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { get } from "../../services/api";
import { Input } from "@/components/ui/input";

export default function LinkField({
  doctype,
  value,
  onChange,
  placeholder,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const searchTimeout = useRef(null);
  const inputRef = useRef(null);
  const [position, setPosition] = useState({});

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
  const handleSearch = (txt) => {
    if (disabled) return;
    onChange(txt);
    setShow(true);

    if (!txt || txt.length < 2) {
      setOptions([]);
      return;
    }

    clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(async () => {
      setLoading(true);

      try {
        const res = await get("method/frappe.desk.search.search_link", {
          doctype,
          txt,
          page_length: 10,
        });

        setOptions(res.message || []);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  /* ===============================
     FOCUS
  =============================== */
  const handleFocus = async () => {
    if (!doctype || disabled) return;

    setShow(true);
    setLoading(true);

    try {
      const res = await get("method/frappe.desk.search.search_link", {
        doctype,
        txt: "",
        page_length: 10,
      });

      setOptions(res.message || []);
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     BLUR
  =============================== */
  const handleBlur = () => {
    setTimeout(() => setShow(false), 200);
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
              onClick={() => {
                onChange(opt.value);
                setShow(false);
              }}
            >
              <span className="text-sm font-medium">{opt.value}</span>
              {opt.description && (
                <span className="truncate text-xs text-muted-foreground">
                  {opt.description}
                </span>
              )}
            </button>
          ))}

        {/* EMPTY */}
        {!loading && options.length === 0 && (
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
          value={value || ""}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled}
        />
      </div>

      {dropdown}
    </>
  );
}
