import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import ThemePanel from "../Theme";
import applyTheme from "../../utils/theme";
import { get } from "../../services/api";
import { getUserSync, getCurrentUser } from "../../utils/getUser";

export default function PageHeader({
  title = "",
  subtitle = "",
  breadcrumbs = [],
  actions = [],
  statusList = [],
  statusFilter = "",
  setStatusFilter = () => {},
  backFallback = "/",
}) {
  const navigate = useNavigate();

  const [user, setUser] = useState("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    // ERPNext mode: read synchronously from window.frappe
    const sync = getUserSync();
    if (sync) {
      setUser(sync.user);
      return;
    }

    // Dev mode: try API fallback
    try {
      const res = await getCurrentUser(get);
      if (res) {
        setUser(res.user);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showUserMenu]);

  const handleBack = () => {
    // Check if we're in ERPNext context and if history is safe
    const isInErpNext = window.location.pathname.includes("/app/");
    
    if (isInErpNext) {
      // In ERPNext: only navigate via React Router (hash-based)
      navigate(backFallback);
    } else {
      // In development: use browser history if safe
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(backFallback);
      }
    }
  };

  const goHome = () => navigate("/");
  const goDesk = () => (window.location.href = "/app");

  return (
    <div className="page-header">
      {/* ================= TOP BAR ================= */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        {/* LEFT */}
        <div className="d-flex align-items-center gap-1">
          <button onClick={handleBack} className="btn btn-icon">
            <i className="bi bi-arrow-left" />
          </button>

          <button onClick={goHome} className="btn btn-icon">
            <i className="bi bi-house" />
          </button>

          <button
            onClick={goDesk}
            className="btn btn-icon d-none d-sm-flex"
            title="Desk"
          >
            <i className="bi bi-grid" />
          </button>
          <div>
            {/* ================= TITLE ================= */}
            <div className="d-none d-md-flex align-items-center gap-2 flex-wrap">
              <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>

              {subtitle && (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  • {subtitle}
                </div>
              )}
            </div>

            {/* ================= BREADCRUMB ================= */}
            {breadcrumbs.length > 0 && (
              <div
                className="d-none d-md-flex align-items-center gap-1 flex-wrap"
                style={{ fontSize: 11, color: "var(--text-muted)" }}
              >
                {breadcrumbs.map((b, i) => {
                  const isLast = i === breadcrumbs.length - 1;

                  return (
                    <div key={i} className="d-flex align-items-center gap-1">
                      <span
                        onClick={() => b.path && navigate(b.path)}
                        style={{
                          cursor: b.path ? "pointer" : "default",
                          color: isLast
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                          fontWeight: isLast ? 500 : 400,
                        }}
                      >
                        {b.label}
                      </span>

                      {!isLast && <span style={{ opacity: 0.4 }}>/</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="d-flex align-items-center gap-2">
          {/* 🔥 PRIMARY ACTION */}
          {actions?.[0] && (
            <button
              className={`btn ${actions[0].variant || "btn-primary"} btn-sm`}
              onClick={actions[0].onClick}
            >
              {actions[0].label}
            </button>
          )}

          {/* 🔥 DESKTOP ACTIONS */}
          <div className="d-none d-sm-flex gap-2">
            {actions.slice(1).map((action, i) => (
              <button
                key={i}
                className={`btn ${action.variant || "btn-primary"}`}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.icon && <i className={action.icon}></i>}
                {action.label}
              </button>
            ))}
          </div>

          {/* 🔥 MOBILE MORE MENU */}
          {actions.length > 1 && (
            <div className="position-relative d-sm-none">
              <button
                className="btn btn-icon"
                onClick={() => setShowMobileMenu((p) => !p)}
              >
                <i className="bi bi-three-dots-vertical" />
              </button>

              {showMobileMenu && (
                <div className="dropdown-menu show p-2 shadow-sm">
                  {actions.slice(1).map((action, i) => (
                    <button
                      key={i}
                      className="dropdown-item"
                      onClick={() => {
                        setShowMobileMenu(false);
                        action.onClick();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* USER DROPDOWN */}
          <div className="position-relative" ref={userMenuRef}>
            <button
              className="btn d-flex align-items-center gap-1"
              style={{
                fontSize: 12,
                height: 34,
                padding: "0 10px",
                borderRadius: 8,
                background: "var(--btn-bg)",
                border: "1px solid var(--btn-border)",
                color: "var(--btn-text)",
                whiteSpace: "nowrap",
              }}
              onClick={() => setShowUserMenu((p) => !p)}
              title={user || "User"}
            >
              <i className="bi bi-person-circle" />
              <span className="d-none d-sm-inline">{user || "User"}</span>
              <i className="bi bi-chevron-down" style={{ fontSize: 10 }} />
            </button>

            {showUserMenu && (
              <div
                className="dropdown-menu show shadow-sm"
                style={{
                  right: 0,
                  left: "auto",
                  minWidth: "180px",
                  zIndex: 1050,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="dropdown-item-text small text-muted border-bottom px-3 py-2">
                  {user || "User"}
                </div>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowUserMenu(false);
                    window.location.href = "/app";
                  }}
                >
                  <i className="bi bi-grid me-2"></i>Back to ERPNext
                </button>
                <div className="dropdown-divider"></div>
                <button
                  className="dropdown-item text-danger"
                  onClick={() => {
                    setShowUserMenu(false);
                    window.location.href = "/logout";
                  }}
                >
                  <i className="bi bi-box-arrow-right me-2"></i>Logout
                </button>
              </div>
            )}
          </div>

          {/* THEME */}
          <div className="header-tools">
            <ThemePanel applyTheme={applyTheme} />
          </div>
        </div>
      </div>

      {/* ================= TITLE ================= */}
      <div className="d-flex d-sm-none align-items-center gap-2 flex-wrap">
        <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>

        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            • {subtitle}
          </div>
        )}
      </div>

      {/* ================= BREADCRUMB ================= */}
      {breadcrumbs.length > 0 && (
        <div
          className="d-flex d-sm-none align-items-center gap-1 mt-1 flex-wrap"
          style={{ fontSize: 11, color: "var(--text-muted)" }}
        >
          {breadcrumbs.map((b, i) => {
            const isLast = i === breadcrumbs.length - 1;

            return (
              <div key={i} className="d-flex align-items-center gap-1">
                <span
                  onClick={() => b.path && navigate(b.path)}
                  style={{
                    cursor: b.path ? "pointer" : "default",
                    color: isLast ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: isLast ? 500 : 400,
                  }}
                >
                  {b.label}
                </span>

                {!isLast && <span style={{ opacity: 0.4 }}>/</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ================= STATUS FILTER ================= */}
      {statusList.length > 0 && (
        <div className="mt-2">
          <div className="filter-group d-none d-sm-flex">
            {statusList.map((s) => (
              <button
                key={s}
                className={`btn btn-filter ${
                  statusFilter === s ? "active" : ""
                }`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="d-block d-sm-none mt-2">
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
