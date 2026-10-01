import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { get } from "../../services/api";
import { UserX, Hourglass, FileText, Timer, CircleCheck, Clock } from "lucide-react";
import StatCard from "../../components/StatCard";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { gridCorners } from "../../lib/gridCorners";

const STAT_BP = [{ cols: 2 }, { min: "md", cols: 4 }];

const STATUS_BADGE = {
  Approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  Rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

const STATUS_KEY = {
  Approved: "ess.overtime.statusApproved",
  Rejected: "ess.overtime.statusRejected",
};

/**
 * ESS Overtime Logs
 *
 * Read-only table showing the current employee's overtime records.
 * OT logs are system-generated; employees can only view them.
 */
export default function OvertimeLogs() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t, i18n } = useTranslation();

  const [employee, setEmployee] = useState(null);
  const [empName, setEmpName] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ── Header ── */
  useEffect(() => {
    setHeader({
      title: t("ess.header.overtimeTitle"),
      subtitle: empName
        ? t("ess.header.overtimeSubtitleEmployee", { name: empName })
        : t("ess.header.overtimeSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.ess"), path: "/ess" },
        { label: t("ess.header.overtimeTitle") },
      ],
      actions: [
        {
          label: t("common.back"),
          variant: "btn-outline-secondary",
          onClick: () => navigate("/ess"),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empName]);

  /* ── Fetch employee for current user ── */
  // fetchEmployee setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function fetchEmployee() {
    try {
      let userId = "";
      if (window.frappe?.session?.user) {
        userId = window.frappe.session.user;
      } else {
        const userRes = await get("method/erpnext_ui.api.get_current_user");
        userId = userRes?.message?.user || "";
      }
      if (!userId) {
        setLoading(false);
        return;
      }

      const res = await get("method/frappe.client.get_list", {
        doctype: "Employee",
        fields: JSON.stringify(["name", "employee_name"]),
        filters: JSON.stringify([["user_id", "=", userId]]),
        limit_page_length: 1,
      });
      const list = res.message || [];
      if (list.length > 0) {
        setEmployee(list[0].name);
        setEmpName(list[0].employee_name || list[0].name);
      }
    } catch (e) {
      console.error("Failed to fetch employee:", e);
    } finally {
      // Always stop loading so users without a linked Employee
      // reach the empty state instead of an infinite spinner.
      setLoading(false);
    }
  }

  useEffect(() => {
    // fetchEmployee setStates only after awaited API responses; the compiler
    // rule conservatively flags any setState-reaching call from an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEmployee();
  }, []);

  /* ── Fetch OT logs once employee is resolved ── */
  // fetchLogs setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await get("resource/Overtime Log", {
        fields: JSON.stringify([
          "name",
          "employee",
          "employee_name",
          "attendance_date",
          "shift",
          "in_time",
          "out_time",
          "overtime_hours",
          "status",
          "remarks",
          "approved_by",
          "approval_date",
        ]),
        filters: JSON.stringify([["employee", "=", employee]]),
        order_by: "attendance_date desc",
        limit_page_length: 200,
      });
      setLogs(res.data || []);
    } catch (e) {
      console.error("Failed to fetch overtime logs:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (employee) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  /* ── Helpers ── */
  const formatDateTime = (dt) => {
    if (!dt) return "—";
    try {
      return new Date(dt).toLocaleString(i18n.language || "en", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dt;
    }
  };

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Spinner className="size-6 text-primary" />
        <span className="text-sm">{t("common.loading")}</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <UserX className="size-7" />
        </div>
        <h5 className="text-base font-semibold">
          {t("ess.overtime.noEmployeeTitle")}
        </h5>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("ess.overtime.noEmployeeDescription")}
        </p>
        <Button onClick={() => navigate("/ess")}>
          {t("ess.overtime.backToDashboard")}
        </Button>
      </div>
    );
  }

  /* ── Summary Stats ── */
  const totalOT = logs.reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
  const approvedCount = logs.filter((l) => l.status === "Approved").length;
  const pendingCount = logs.filter((l) => l.status === "Draft").length;

  return (
    <div className="mx-auto w-full max-w-[1600px] pt-4">
      {/* ── Summary Cards ── */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard
          value={logs.length}
          label={t("ess.overtime.totalLogs")}
          icon={FileText}
          className={gridCorners({ breakpoints: STAT_BP, index: 0, count: 4 })}
        />
        <StatCard
          value={totalOT.toFixed(2)}
          label={t("ess.overtime.totalOTHours")}
          icon={Timer}
          color="var(--brand-primary)"
          className={gridCorners({ breakpoints: STAT_BP, index: 1, count: 4 })}
        />
        <StatCard
          value={approvedCount}
          label={t("ess.overtime.approved")}
          icon={CircleCheck}
          color="var(--chart-2)"
          className={gridCorners({ breakpoints: STAT_BP, index: 2, count: 4 })}
        />
        <StatCard
          value={pendingCount}
          label={t("ess.overtime.pending")}
          icon={Clock}
          color="var(--chart-3)"
          className={gridCorners({ breakpoints: STAT_BP, index: 3, count: 4 })}
        />
      </div>

      {/* ── Logs Table ── */}
      {logs.length === 0 ? (
        <Empty className="rounded-none bg-card ring-1 ring-foreground/10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Hourglass />
            </EmptyMedia>
            <EmptyTitle>{t("ess.overtime.noRecordsTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("ess.overtime.noRecordsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-none bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ess.overtime.columns.date")}</TableHead>
                <TableHead>{t("ess.overtime.columns.shift")}</TableHead>
                <TableHead>{t("ess.overtime.columns.inTime")}</TableHead>
                <TableHead>{t("ess.overtime.columns.outTime")}</TableHead>
                <TableHead>{t("ess.overtime.columns.otHours")}</TableHead>
                <TableHead>{t("ess.overtime.columns.status")}</TableHead>
                <TableHead>{t("ess.overtime.columns.remarks")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.name}>
                  <TableCell>{log.attendance_date || "—"}</TableCell>
                  <TableCell>{log.shift || "—"}</TableCell>
                  <TableCell>{formatDateTime(log.in_time)}</TableCell>
                  <TableCell>{formatDateTime(log.out_time)}</TableCell>
                  <TableCell>
                    <strong>{log.overtime_hours || 0}</strong>{" "}
                    {t("ess.overtime.hrs")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        STATUS_BADGE[log.status] ||
                        "border-amber-500/40 bg-amber-500/10 text-amber-600"
                      }
                    >
                      {t(STATUS_KEY[log.status] || "ess.overtime.statusDraft")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.remarks || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
