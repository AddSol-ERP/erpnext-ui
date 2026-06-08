import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useToast } from "../../context/ToastContext";
import { get } from "../../services/api";
import { FormField } from "../../components/FormField";

/**
 * ESS Profile page.
 * Reads the logged user's Employee record via the Employee doctype
 * (which has a `user_id` field linking to the User).
 * Displays in read-only mode initially.
 */
export default function ESSProfile() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const toast = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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
          variant: "btn-outline-primary",
          icon: "bi bi-arrow-left",
          onClick: () => navigate("/ess"),
        },
      ],
    });
    return () => setHeader({});
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // Get logged user
      const userRes = await get("method/frappe.auth.get_logged_user");
      const currentUser = userRes.message;

      if (!currentUser) {
        toast.error("Could not identify current user");
        return;
      }

      // Fetch Employee linked to this user
      const empRes = await get("resource/Employee", {
        filters: JSON.stringify([["user_id", "=", currentUser]]),
        fields: JSON.stringify(["*"]),
        limit_page_length: 1,
      });

      const employees = empRes.data;
      if (employees && employees.length > 0) {
        setProfile(employees[0]);
      } else {
        // Fallback: try fetching by "employee" param from user
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
          <i className="bi bi-person-exclamation" style={{ fontSize: 48 }}></i>
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

  return (
    <div className="generic-form">
      {/* Profile Header */}
      <div className="d-flex align-items-center gap-3 mb-4 p-3 card">
        <div
          className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
          style={{ width: 72, height: 72, fontSize: 28 }}
        >
          {(profile.employee_name || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <h4 className="mb-1">{profile.employee_name}</h4>
          <div className="text-muted">
            {profile.designation || "—"} &middot; {profile.department || "—"}
          </div>
          <div className="small text-muted">
            Employee ID: {profile.name} &middot; Status:{" "}
            <span
              className={`badge ${
                profile.status === "Active"
                  ? "bg-success"
                  : profile.status === "Inactive"
                    ? "bg-danger"
                    : "bg-secondary"
              }`}
            >
              {profile.status || "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Profile Fields (read-only) */}
      <div className="row">
        <ProfileField label="Employee Name" value={profile.employee_name} col="md-6" />
        <ProfileField label="Employee ID" value={profile.name} col="md-6" />
        <ProfileField label="Date of Birth" value={profile.date_of_birth} col="md-6" />
        <ProfileField label="Gender" value={profile.gender} col="md-6" />
        <ProfileField label="Company" value={profile.company} col="md-6" />
        <ProfileField label="Department" value={profile.department} col="md-6" />
        <ProfileField label="Designation" value={profile.designation} col="md-6" />
        <ProfileField label="Branch" value={profile.branch} col="md-6" />
        <ProfileField label="Date of Joining" value={profile.date_of_joining} col="md-6" />
        <ProfileField label="Contract End Date" value={profile.contract_end_date} col="md-6" />
        <ProfileField label="Personal Email" value={profile.personal_email} col="md-6" />
        <ProfileField label="Company Email" value={profile.company_email} col="md-6" />
        <ProfileField label="Mobile Number" value={profile.cell_number} col="md-6" />
        <ProfileField label="Emergency Contact" value={profile.personal_phone} col="md-6" />
        <ProfileField label="Current Address" value={profile.current_address} col="md-12" />
        <ProfileField label="Permanent Address" value={profile.permanent_address} col="md-12" />
      </div>

      <div className="text-muted small mt-4 pt-3 border-top">
        <div className="row">
          <div className="col-md-4">Last Updated: {profile.modified}</div>
          <div className="col-md-4">Created: {profile.creation}</div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value, col = "md-6" }) {
  return (
    <div className={`col-${col} mb-3`}>
      <FormField label={label}>
        <input
          type="text"
          className="form-control bg-light"
          value={value || "—"}
          readOnly
          disabled
        />
      </FormField>
    </div>
  );
}
