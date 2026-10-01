import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { useToast } from "../../context/ToastContext";
import { get } from "../../services/api";
import { getCurrentUser } from "../../utils/getUser";
import { getDoctypeConfig } from "../../config/doctypes";
import { UserX, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const { t } = useTranslation();

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
      title: t("ess.header.profileTitle"),
      subtitle: t("ess.header.profileSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("ess.header.title"), path: "/ess" },
        { label: t("ess.header.profileTitle") },
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
  }, []);

  useEffect(() => {
    if (!profile) return;
    setHeader((prev) => ({
      ...prev,
      actions: [
        {
          label: t("ess.header.appointmentLetter"),
          variant: "btn-outline-primary",
          onClick: downloadPdf,
        },
        {
          label: t("ess.header.print"),
          variant: "btn-outline-primary",
          onClick: handlePrint,
        },
        {
          label: t("common.back"),
          variant: "btn-outline-secondary",
          onClick: () => navigate("/ess"),
        },
      ],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // loadProfile setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function loadProfile() {
    setLoading(true);
    try {
      // Use hybrid resolution: window.frappe.session in ERPNext mode,
      // custom whitelisted API fallback in dev mode.
      // Direct frappe.auth.get_logged_user is NOT available for Employee-only roles.
      const userInfo = await getCurrentUser(get);
      const currentUser = userInfo?.user;

      if (!currentUser) {
        toast.error(t("ess.profile.userNotFound"));
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
        toast.info(t("ess.profile.notFoundInfo"));
      }
    } catch (e) {
      console.error("Failed to load profile:", e);
      toast.error(t("ess.profile.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Spinner className="size-6 text-primary" />
        <span className="text-sm">{t("ess.profile.loading")}</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <UserX className="size-7" />
        </div>
        <h5 className="text-base font-semibold">
          {t("ess.profile.notFoundTitle")}
        </h5>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("ess.profile.notFoundDescription")}
        </p>
        <Button onClick={() => navigate("/ess")}>
          {t("ess.profile.backToDashboard")}
        </Button>
      </div>
    );
  }

  const p = profile;
  const statusClass =
    p.status === "Active"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
      : p.status === "Inactive"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";

  return (
    <div className="mx-auto w-full max-w-[1600px] pt-4">
      {/* ── Profile Header Card ── */}
      <Card className="mb-4">
        <CardContent className="flex flex-row items-center gap-4 py-4">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-primary-foreground">
            {(p.employee_name || "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 text-lg font-semibold">{p.employee_name}</h3>
            <div className="text-muted-foreground">
              {[p.designation, p.department].filter(Boolean).join(" · ") ||
                "—"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t("ess.profile.idLabel", { id: p.name })}</span>
              <span aria-hidden="true">|</span>
              <Badge variant="outline" className={statusClass}>
                {p.status || "N/A"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── HR Approval Warning ── */}
      {!p.custom_hr_approved && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <strong>{t("ess.profile.hrApprovalTitle")}</strong>
            <div className="mt-1">
              {t("ess.profile.hrApprovalDescription")}
            </div>
          </div>
        </div>
      )}

      {/* ── Personal Details ── */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("ess.profile.sectionPersonal")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileField
            label={t("ess.profile.fields.employeeName")}
            value={p.employee_name}
          />
          <ProfileField
            label={t("ess.profile.fields.dateOfBirth")}
            value={p.date_of_birth}
          />
          <ProfileField
            label={t("ess.profile.fields.gender")}
            value={p.gender}
          />
          <ProfileField
            label={t("ess.profile.fields.employeeId")}
            value={p.name}
          />
        </CardContent>
      </Card>

      {/* ── Employment ── */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("ess.profile.sectionEmployment")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileField
            label={t("ess.profile.fields.company")}
            value={p.company}
          />
          <ProfileField
            label={t("ess.profile.fields.department")}
            value={p.department}
          />
          <ProfileField
            label={t("ess.profile.fields.designation")}
            value={p.designation}
          />
          <ProfileField
            label={t("ess.profile.fields.branch")}
            value={p.branch}
          />
          <ProfileField
            label={t("ess.profile.fields.dateOfJoining")}
            value={p.date_of_joining}
          />
          <ProfileField
            label={t("ess.profile.fields.contractEndDate")}
            value={p.contract_end_date}
          />
        </CardContent>
      </Card>

      {/* ── Contact ── */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("ess.profile.sectionContact")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileField
            label={t("ess.profile.fields.personalEmail")}
            value={p.personal_email}
          />
          <ProfileField
            label={t("ess.profile.fields.companyEmail")}
            value={p.company_email}
          />
          <ProfileField
            label={t("ess.profile.fields.mobileNumber")}
            value={p.cell_number}
          />
          <ProfileField
            label={t("ess.profile.fields.emergencyContact")}
            value={p.personal_phone}
          />
        </CardContent>
      </Card>

      {/* ── Address ── */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("ess.profile.sectionAddress")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProfileField
            label={t("ess.profile.fields.currentAddress")}
            value={p.current_address}
            wide
          />
          <ProfileField
            label={t("ess.profile.fields.permanentAddress")}
            value={p.permanent_address}
            wide
          />
        </CardContent>
      </Card>

      {/* ── System Info ── */}
      <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          <div>
            {t("ess.profile.lastUpdated", { date: p.modified })}
          </div>
          <div>{t("ess.profile.created", { date: p.creation })}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   Profile read-only field row
   Clean label+value display instead of a
   disabled bootstrap input.
   ─────────────────────────────────────────── */
function ProfileField({ label, value, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 flex min-h-9 items-center rounded-lg bg-muted/50 px-2.5 text-sm text-foreground">
        {value || "—"}
      </div>
    </div>
  );
}
