import { useEffect, useState } from "react";
import { get } from "../services/api";

export default function CheckinLogs({ date, employee }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCheckinLogs();
  }, [date, employee]);

  const fetchCheckinLogs = async () => {
    setLoading(true);
    try {
      // Fetch employee check-ins for the date
      const res = await get("resource/Employee Checkin", {
        fields: JSON.stringify([
          "name",
          "checkin_time",
          "checkout_time",
          "status",
        ]),
        filters: JSON.stringify([
          ["employee", "=", employee],
          ["DATE(checkin_time)", "=", date],
        ]),
        limit_page_length: 100,
      });

      setLogs(res.data || []);
    } catch (error) {
      console.error("Failed to fetch check-in logs:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-3">Loading...</div>;
  }

  if (!logs.length) {
    return (
      <div className="text-muted text-center py-3">No check-in logs found</div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.name}>
              <td>{log.checkin_time || "-"}</td>
              <td>{log.checkout_time || "-"}</td>
              <td>
                <span
                  className={`badge ${
                    log.status === "Checked In" ? "bg-success" : "bg-secondary"
                  }`}
                >
                  {log.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
