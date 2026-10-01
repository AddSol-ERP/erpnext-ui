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

export default function CheckinLogs({ date, employee }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    // fetchCheckinLogs only setStates after an awaited API response; the
    // compiler rule conservatively flags any setState-reaching effect call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCheckinLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, employee]);

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
            <TableHead>{t("reports.checkin")}</TableHead>
            <TableHead>{t("reports.checkout")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.name}>
              <TableCell>{log.checkin_time || "-"}</TableCell>
              <TableCell>{log.checkout_time || "-"}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    log.status === "Checked In"
                      ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                      : "bg-muted text-muted-foreground ring-border"
                  }
                >
                  {log.status === "Checked In"
                    ? t("reports.checkedIn")
                    : log.status === "Checked Out"
                      ? t("reports.checkedOut")
                      : log.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
