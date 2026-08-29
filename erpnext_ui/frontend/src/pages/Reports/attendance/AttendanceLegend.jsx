export default function AttendanceLegend() {
  return (
    <div className="mb-3">
      <span className="badge bg-success me-2">Present</span>
      <span className="badge bg-danger me-2">Absent</span>
      <span className="badge bg-warning me-2">Half Day</span>
      <span className="badge bg-primary me-2">Leave</span>
      <span
        className="badge me-2"
        style={{ background: "#64748b", color: "#fff" }}
      >
        Weekly Off
      </span>
      <span
        className="badge me-2"
        style={{ background: "#14b8a6", color: "#fff" }}
      >
        Holiday
      </span>
    </div>
  );
}
