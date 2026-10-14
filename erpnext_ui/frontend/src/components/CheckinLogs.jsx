import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { get } from "../services/api";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// The punches all fall on `date`, which is already in the popup title, so only
// the clock time is worth showing. Tolerates both the space-separated form
// Frappe returns and an ISO "T" separator.
function punchTime(value) {
  if (!value) return "-";
  const s = String(value);
  const parts = s.split(/[T ]/);
  return parts.length > 1 ? parts.slice(1).join(" ").slice(0, 8) : s;
}

export default function CheckinLogs({ employee = null, date }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCheckinLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // Server-side, not `resource/Employee Checkin` directly.
      //
      // That call guessed the schema and every field it named was wrong --
      // `checkin_time`, `checkout_time`, `status` and `log_date` do not exist on
      // HRMS' Employee Checkin (the moment is `time`, the direction is
      // `log_type`). Frappe rejects the first unknown field outright with
      // `DataError: Field not permitted in query: checkin_time`, and since it
      // raises on the FIRST bad field the message named whichever happened to be
      // listed first -- so it read like a permissions fault, not a schema one.
      //
      // It cannot be fixed by swapping in the correct names here: the punch time
      // is permlevel 1, and for a high-permlevel field Frappe does NOT raise --
      // it silently drops it from the result. A wrong guess would render an
      // empty table with no error anywhere. `get_checkin_logs` resolves the
      // columns from the live meta and fails closed instead.
      //
      // `employee` is optional and only ever sent when the caller has one: the
      // ESS calendar passes null and the server falls back to the session's own
      // Employee, while the Attendance report passes the row's employee so an
      // HR/HOD can inspect someone else. It is AUTHORISED server-side through
      // _get_scope -- sending a code proves nothing, since employee codes are
      // guessable. Sending null never widens access.
      const res = await get("method/erpnext_ui.api.get_checkin_logs", { employee, date });
      setLogs(res.message?.logs || []);
    } catch (e) {
      // Surfaced rather than swallowed. The old catch set an empty list, which
      // is indistinguishable from "you had no punches" -- exactly how a
      // permission fault hides behind an empty state.
      setError(e?.message || t("reports.checkinLogsError"));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // fetchCheckinLogs only setStates after an awaited API response; the
    // compiler rule conservatively flags any setState-reaching effect call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCheckinLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, date]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-3">
        <Spinner className="size-4 text-primary" />
        <span className="text-sm text-muted-foreground">
          {t("common.loading")}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="py-3 text-center text-muted-foreground">
        {t("reports.noCheckinLogs")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.time")}</TableHead>
            <TableHead>{t("common.type")}</TableHead>
            <TableHead>{t("common.device")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            // One punch is one row; `log_type` carries the direction. There is no
            // checkout column to pair against -- that was the invented shape.
            const isIn = (log.log_type || "").toUpperCase() === "IN";
            const isOut = (log.log_type || "").toUpperCase() === "OUT";
            return (
              <TableRow key={log.name}>
                <TableCell className="font-medium tabular-nums">
                  {punchTime(log.time)}
                </TableCell>
                <TableCell>
                  {isIn || isOut ? (
                    <Badge
                      variant="outline"
                      className={
                        isIn
                          ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                          : "bg-muted text-muted-foreground ring-border"
                      }
                    >
                      {isIn
                        ? t("reports.checkedIn")
                        : t("reports.checkedOut")}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">
                      {log.log_type || "-"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {log.device_id || "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}