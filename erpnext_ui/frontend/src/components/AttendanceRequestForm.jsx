import { useState } from "react";
import { post } from "../services/api";

export default function AttendanceRequestForm({ date, employee, onClose }) {
  const [loading, setLoading] = useState(false);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create an attendance request or employee checkin record
      await post("resource/Employee Checkin", {
        employee,
        checkin_time: `${date} ${checkInTime}:00`,
        checkout_time: checkOutTime ? `${date} ${checkOutTime}:00` : null,
        reason,
      });

      alert("Attendance request created successfully");
      onClose();
    } catch (error) {
      console.error("Failed to create attendance request:", error);
      alert("Failed to create attendance request");
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
        <label className="form-label">Check-in Time</label>
        <input
          type="time"
          className="form-control"
          value={checkInTime}
          onChange={(e) => setCheckInTime(e.target.value)}
          required
        />
      </div>

      <div className="mb-3">
        <label className="form-label">Check-out Time (Optional)</label>
        <input
          type="time"
          className="form-control"
          value={checkOutTime}
          onChange={(e) => setCheckOutTime(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label className="form-label">Reason</label>
        <textarea
          className="form-control"
          rows="3"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason for manual attendance..."
        ></textarea>
      </div>

      <div className="d-flex gap-2">
        <button
          type="submit"
          className="btn btn-primary flex-fill"
          disabled={loading || !checkInTime}
        >
          {loading ? "Creating..." : "Create Attendance"}
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
