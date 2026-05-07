import { useState } from "react";
import { post } from "../services/api";

export default function LeaveRequestForm({ date, employee, onClose }) {
  const [loading, setLoading] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await post("resource/Leave Application", {
        employee,
        from_date: date,
        to_date: date,
        leave_type: leaveType,
        reason,
      });

      alert("Leave request created successfully");
      onClose();
    } catch (error) {
      console.error("Failed to create leave request:", error);
      alert("Failed to create leave request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label className="form-label">Date</label>
        <input type="text" className="form-control" value={date} disabled />
      </div>

      <div className="mb-3">
        <label className="form-label">Employee</label>
        <input type="text" className="form-control" value={employee} disabled />
      </div>

      <div className="mb-3">
        <label className="form-label">Leave Type</label>
        <select
          className="form-select"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          required
        >
          <option value="">Select Leave Type</option>
          <option value="Sick Leave">Sick Leave</option>
          <option value="Casual Leave">Casual Leave</option>
          <option value="Paid Leave">Paid Leave</option>
          <option value="Unpaid Leave">Unpaid Leave</option>
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label">Reason</label>
        <textarea
          className="form-control"
          rows="3"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason for leave..."
        ></textarea>
      </div>

      <div className="d-flex gap-2">
        <button
          type="submit"
          className="btn btn-primary flex-fill"
          disabled={loading || !leaveType}
        >
          {loading ? "Creating..." : "Create Leave Request"}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
