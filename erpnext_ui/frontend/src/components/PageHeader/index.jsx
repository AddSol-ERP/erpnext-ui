import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
  const [showMore, setShowMore] = useState(false);

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
                onClick={() => setShowMore((p) => !p)}
              >
                <i className="bi bi-three-dots-vertical" />
              </button>

              {showMore && (
                <div className="dropdown-menu show p-2 shadow-sm">
                  {actions.slice(1).map((action, i) => (
                    <button
                      key={i}
                      className="dropdown-item"
                      onClick={() => {
                        setShowMore(false);
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

          {/* USER */}
          <div
            className="d-flex align-items-center gap-1"
            style={{ fontSize: 12 }}
          >
            <i className="bi bi-person-circle" />
            <span className="d-none d-sm-inline">{user || "User"}</span>
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
