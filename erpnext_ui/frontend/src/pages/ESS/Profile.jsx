import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useToast } from "../../context/ToastContext";
import { get } from "../../services/api";
import { getCurrentUser } from "../../utils/getUser";
import { getDoctypeConfig } from "../../config/doctypes";

/**
 * ESS Profile page.
 * Reads the logged user's Employee record via the Employee doctype
 * (which has a `user_id` field linking to the User).
 * Uses the standard form-section card pattern for a clean read-only display.
 */
export default function ESSProfile() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Read configured print format from doctypes.js
  const employeeConfig = getDoctypeConfig("Employee");
  const printFormat = employeeConfig.printFormat || "Employee Appointment Letter";

  /* ── Print / Download helpers ── */
  const downloadPdf = () => {
    if (!profile) return;
    const params = new URLSearchParams({
      doctype: "Employee",
      name: profile.name,
      format: printFormat,
    });
    window.open(
      `/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`,
      "_blank"
    );
  };

  const handlePrint = () => {
    if (!profile) return;
    const params = new URLSearchParams({
      doctype: "Employee",
      name: profile.name,
      format: printFormat,
    });
    window.open(
      `/printview?${params.toString()}`,
      "_blank"
    );
  };

  /* ── Header: set on mount with Back only; update with actions once profile loaded ── */
  useEffect(() => {
    setHeader({
      title: "My Profile",
      subtitle: "View your employee information",
      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Employee Self Service", path: "/ess" },
        { label: "My Profile" },
      ],
      actions: [
        {
          label: "Back",
          variant: "btn-outline-secondary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate("/ess"),
        },
      ],
    });
    return () => setHeader({});
  }, []);

  useEffect(() => {
    if (!profile) return;
    setHeader((prev) => ({
      ...prev,
      actions: [
        {
          label: "Appointment Letter",
          variant: "btn-outline-primary",
          icon: "bi bi-file-earmark-pdf",
          onClick: downloadPdf,
        },
        {
          label: "Print",
          variant: "btn-outline-primary",
          icon: "bi bi-printer",
          onClick: handlePrint,
        },
        {
          label: "Back",
          variant: "btn-outline-secondary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate("/ess"),
        },
      ],
    }));
  }, [profile]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // Use hybrid resolution: window.frappe.session in ERPNext mode,
      // custom whitelisted API fallback in dev mode.
      // Direct frappe.auth.get_logged_user is NOT available for Employee-only roles.
      const userInfo = await getCurrentUser(get);
      const currentUser = userInfo?.user;

      if (!currentUser) {
        toast.error("Could not identify current user");
        return;
      }

      const empRes = await get("resource/Employee", {
        filters: JSON.stringify([["user_id", "=", currentUser]]),
        fields: JSON.stringify(["*"]),
        limit_page_length: 1,
      });

      const employees = empRes.data;
      if (employees && employees.length > 0) {
        setProfile(employees[0]);
      } else {
        toast.info("Employee profile not found. Try creating one.");
      }
    } catch (e) {
      console.error("Failed to load profile:", e);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-5">
        <div className="mb-3">
          <i className="bi bi-person-exclamation" style={{ fontSize: 48 }} />
        </div>
        <h5>No Employee Profile Found</h5>
        <p className="text-muted">
          Your user account is not linked to an Employee record.
          Please contact HR to set up your profile.
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/ess")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const p = profile;
  const statusColor =
    p.status === "Active"
      ? "bg-success"
      : p.status === "Inactive"
        ? "bg-danger"
        : "bg-secondary";

  return (
    <div>
      {/* ── Profile Header Card ── */}
      <div className="card p-4 mb-4 d-flex flex-row align-items-center gap-4">
        <div
          className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0"
          style={{ width: 80, height: 80, fontSize: 32 }}
        >
          {(p.employee_name || "U").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="mb-1">{p.employee_name}</h3>
          <div className="text-muted">
            {[p.designation, p.department].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="d-flex align-items-center gap-2 mt-1 small text-muted">
            <span>ID: {p.name}</span>
            <span className="text-muted">|</span>
            <span className={`badge ${statusColor}`}>{p.status || "N/A"}</span>
          </div>
        </div>
      </div>

      {/* ── Personal Details ── */}
      <div className="form-section mb-4">
        <div className="form-section-title">Personal Details</div>
        <div className="row">
          <ProfileField label="Employee Name" value={p.employee_name} />
          <ProfileField label="Date of Birth" value={p.date_of_birth} />
          <ProfileField label="Gender" value={p.gender} />
          <ProfileField label="Employee ID" value={p.name} />
        </div>
      </div>

      {/* ── Employment ── */}
      <div className="form-section mb-4">
        <div className="form-section-title">Employment</div>
        <div className="row">
          <ProfileField label="Company" value={p.company} />
          <ProfileField label="Department" value={p.department} />
          <ProfileField label="Designation" value={p.designation} />
          <ProfileField label="Branch" value={p.branch} />
          <ProfileField label="Date of Joining" value={p.date_of_joining} />
          <ProfileField label="Contract End Date" value={p.contract_end_date} />
        </div>
      </div>

      {/* ── Contact ── */}
      <div className="form-section mb-4">
        <div className="form-section-title">Contact</div>
        <div className="row">
          <ProfileField label="Personal Email" value={p.personal_email} />
          <ProfileField label="Company Email" value={p.company_email} />
          <ProfileField label="Mobile Number" value={p.cell_number} />
          <ProfileField label="Emergency Contact" value={p.personal_phone} />
        </div>
      </div>

      {/* ── Address ── */}
      <div className="form-section mb-4">
        <div className="form-section-title">Address</div>
        <div className="row">
          <ProfileField label="Current Address" value={p.current_address} wide />
          <ProfileField label="Permanent Address" value={p.permanent_address} wide />
        </div>
      </div>

      {/* ── System Info ── */}
      <div className="text-muted small mt-4 pt-3 border-top">
        <div className="row">
          <div className="col-md-6">Last Updated: {p.modified}</div>
          <div className="col-md-6">Created: {p.creation}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   Profile read-only field row
   Uses the app's standard .form-section field layout
   but with clean label+value text instead of a disabled input.
   ─────────────────────────────────────────── */
function ProfileField({ label, value, wide }) {
  return (
    <div className={`col-md-${wide ? 12 : 6} mb-3`}>
      <div className="form-field">
        <span className="form-label">{label}</span>
        <div
          className="form-control"
          style={{
            minHeight: 38,
            display: "flex",
            alignItems: "center",
            background: "var(--form-section-bg)",
            cursor: "default",
          }}
        >
          {value || "—"}
        </div>
      </div>
    </div>
  );
}
