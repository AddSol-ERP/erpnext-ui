import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { get } from "../../services/api";

export default function LinkField({ doctype, value, onChange, placeholder }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const searchTimeout = useRef(null);
  const inputRef = useRef(null);
  const [position, setPosition] = useState({});

  /* ===============================
     POSITION CALCULATION
  ============================== */
  const updatePosition = () => {
    if (!inputRef.current) return;

    const rect = inputRef.current.getBoundingClientRect();

    setPosition({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
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
  ============================== */
  const handleSearch = (txt) => {
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
  ============================== */
  const handleFocus = async () => {
    if (!doctype) return;

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
  ============================== */
  const handleBlur = () => {
    setTimeout(() => setShow(false), 200);
  };

  /* ===============================
     DROPDOWN UI (PORTAL)
  ============================== */
  const dropdown =
    show &&
    (loading || options.length > 0) &&
    createPortal(
      <div
        className="dropdown-menu show p-2"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 2000,
          maxHeight: "300px",
          overflowY: "auto",
        }}
      >
        {/* LOADING */}
        {loading && (
          <div className="text-center py-2">
            <div className="spinner-border spinner-border-sm me-2" />
            <span className="small text-muted">Loading...</span>
          </div>
        )}

        {/* OPTIONS */}
        {!loading &&
          options.map((opt) => (
            <button
              key={opt.value}
              className="dropdown-item"
              onClick={() => {
                onChange(opt.value);
                setShow(false);
              }}
            >
              <div className="fw-semibold">{opt.value}</div>
              <div className="text-muted small">{opt.description}</div>
            </button>
          ))}

        {/* EMPTY */}
        {!loading && options.length === 0 && (
          <div className="text-muted small px-2 py-1">No results</div>
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <div className="position-relative">
        <input
          ref={inputRef}
          type="text"
          className="form-control"
          value={value || ""}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
        />
      </div>

      {dropdown}
    </>
  );
}
