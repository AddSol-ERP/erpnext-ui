import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileText } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormErrorSummary from "../../../components/FormErrorSummary";
import { focusFirstError } from "../../../lib/formValidation";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function LeaveApplicationForm() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  // Pre-fill from URL search params (used when navigating from attendance calendar)
  const prefilledDate = searchParams.get("from_date") || "";

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [leaveBalance, setLeaveBalance] = useState(null);
  const [approverError, setApproverError] = useState("");

  const [doc, setDoc] = useState({
    employee: "",
    leave_approver: "",
    leave_type: "",
    from_date: prefilledDate,
    to_date: prefilledDate,
    half_day: 0,
    reason: "",
  });

  /* ================= AUTO EMPLOYEE ================= */
  // autoSetEmployee setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function autoSetEmployee() {
    const res = await get("method/frappe.client.get_list", {
      doctype: "Employee",
      fields: JSON.stringify(["name"]),
      limit_page_length: 2,
    });

    const list = res.message || [];

    if (list.length === 1) {
      setDoc((prev) => ({
        ...prev,
        employee: list[0].name,
      }));
    }
  }

  useEffect(() => {
    if (isEdit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    autoSetEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= LOAD ================= */
  // loadDoc setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function loadDoc() {
    setLoading(true);
    try {
      const res = await get(`resource/Leave Application/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee || "",
        leave_approver: d.leave_approver || "",
        leave_type: d.leave_type || "",
        from_date: d.from_date || "",
        to_date: d.to_date || "",
        half_day: d.half_day || 0,
        reason: d.reason || "",
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch {
      setError(t("requests.leave.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= APPROVER ================= */
  // fetchApprover setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function fetchApprover() {
    try {
      const res = await get(
        "method/hrms.hr.doctype.leave_application.leave_application.get_leave_approver",
        { employee: doc.employee },
      );

      if (!res.message) {
        setApproverError(t("requests.leave.noApprover"));
        setDoc((prev) => ({ ...prev, leave_approver: "" }));
      } else {
        setApproverError("");
        setDoc((prev) => ({
          ...prev,
          leave_approver: res.message,
        }));
      }
    } catch {
      setApproverError(t("requests.leave.approverFetchFailed"));
    }
  }

  useEffect(() => {
    if (doc.employee) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApprover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.employee]);

  /* ================= LEAVE DETAILS ================= */
  // fetchLeaveDetails setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function fetchLeaveDetails() {
    try {
      const res = await get(
        "method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
        {
          employee: doc.employee,
          leave_type: doc.leave_type,
          date: doc.from_date,
        },
      );

      setLeaveBalance(res.message?.leave_balance || 0);
    } catch {
      setLeaveBalance(null);
    }
  }

  useEffect(() => {
    if (doc.employee && doc.leave_type) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchLeaveDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.employee, doc.leave_type]);

  /* ================= DAYS ================= */
  const getTotalDays = () => {
    if (!doc.from_date || !doc.to_date) return 0;

    const from = new Date(doc.from_date);
    const to = new Date(doc.to_date);

    let days = (to - from) / (1000 * 60 * 60 * 24) + 1;

    if (doc.half_day) days -= 0.5;

    return days;
  };

  const totalDays = getTotalDays();

  /* ================= VALIDATION ================= */
  const validate = () => {
    const errs = {};

    if (!doc.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.leave.employee"),
      });
    }
    if (!doc.leave_type) {
      errs.leave_type = t("common.fieldRequired", {
        field: t("requests.leave.leaveType"),
      });
    }
    if (!doc.from_date) {
      errs.from_date = t("common.fieldRequired", {
        field: t("requests.leave.fromDate"),
      });
    }
    if (!doc.to_date) {
      errs.to_date = t("common.fieldRequired", {
        field: t("requests.leave.toDate"),
      });
    }
    if (!doc.leave_approver) {
      errs.leave_approver = t("requests.leave.validationApprover");
    }
    if (doc.from_date && doc.to_date && doc.to_date < doc.from_date) {
      errs.to_date = t("requests.leave.validationRange");
    }
    if (
      leaveBalance !== null &&
      totalDays > leaveBalance &&
      !errs.to_date &&
      !errs.from_date
    ) {
      errs.from_date = t("requests.leave.validationBalance");
    }

    const list = Object.values(errs);
    setFieldErrors(errs);
    return {
      fieldErrors: errs,
      summary: list.length > 1 ? t("common.fixErrors") : list[0] || "",
    };
  };

  /* ================= SAVE ================= */
  async function handleSave() {
    const result = validate();
    if (Object.keys(result.fieldErrors).length) {
      setError(result.summary);
      requestAnimationFrame(() => focusFirstError(result.fieldErrors));
      return;
    }

    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await post(`resource/Leave Application/${name}`, doc);
      } else {
        await post("resource/Leave Application", doc);
      }

      navigate("/requests/leave");
    } catch {
      setError(t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("requests.header.leaveEditTitle", { name })
        : t("requests.header.leaveNewTitle"),
      subtitle: isEdit
        ? t("requests.header.leaveEditSubtitle")
        : t("requests.header.leaveNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        { label: t("requests.header.leaveListTitle"), path: "/requests/leave" },
        { label: isEdit ? name : t("common.new") },
      ],

      actions: [
        !isSubmitted && {
          label: loading ? t("common.saving") : t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        },

        isEdit &&
          !isSubmitted && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, name, isEdit, setHeader, loading, isSubmitted]);

  const isDisabled = isSubmitted || !!approverError;

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {approverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400"
        >
          {approverError}
        </div>
      )}

      <FormSection
        title={t("requests.leave.sectionDetails")}
        icon={CalendarDays}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.employee")}
            required
            name="employee"
            error={fieldErrors.employee}
          >
            {isSubmitted ? (
              <Input value={doc.employee} disabled />
            ) : (
              <LinkField
                doctype="Employee"
                value={doc.employee}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, employee: v })}
              />
            )}
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.approver")}
            name="leave_approver"
            error={fieldErrors.leave_approver}
          >
            <Input
              value={doc.leave_approver || t("requests.leave.autoAssigned")}
              disabled
            />
          </FormField>
        </div>

        <div className="md:col-span-2">
          <FormField
            label={t("requests.leave.leaveType")}
            required
            name="leave_type"
            error={fieldErrors.leave_type}
          >
            {isSubmitted ? (
              <Input value={doc.leave_type} disabled />
            ) : (
              <LinkField
                doctype="Leave Type"
                value={doc.leave_type}
                disabled={isDisabled}
                onChange={(v) => setDoc({ ...doc, leave_type: v })}
              />
            )}

            {leaveBalance !== null && !fieldErrors.leave_type && (
              <small className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("requests.leave.balance", { days: leaveBalance })}
              </small>
            )}
          </FormField>
        </div>

        <div className="md:col-span-1">
          <FormField
            label={t("requests.leave.fromDate")}
            required
            name="from_date"
            error={fieldErrors.from_date}
          >
            <Input
              type="date"
              disabled={isDisabled}
              value={doc.from_date}
              onChange={(e) => setDoc({ ...doc, from_date: e.target.value })}
            />
          </FormField>
        </div>

        <div className="md:col-span-1">
          <FormField
            label={t("requests.leave.toDate")}
            required
            name="to_date"
            error={fieldErrors.to_date}
          >
            <Input
              type="date"
              disabled={isDisabled}
              min={doc.from_date}
              value={doc.to_date}
              onChange={(e) => setDoc({ ...doc, to_date: e.target.value })}
            />
          </FormField>
        </div>

        {totalDays > 0 && (
          <div className="md:col-span-4">
            <small className="text-xs text-primary">
              {t("requests.leave.totalDays", { days: totalDays })} ·{" "}
              {t("requests.leave.remaining", {
                days:
                  leaveBalance !== null ? leaveBalance - totalDays : "-",
              })}
            </small>
          </div>
        )}
      </FormSection>

      <FormSection
        title={t("requests.leave.sectionNotes")}
        icon={FileText}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <FormField label={t("requests.leave.halfDay")} name="half_day">
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={doc.half_day ? "default" : "outline"}
              disabled={isDisabled}
              onClick={() => setDoc({ ...doc, half_day: 1 })}
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              variant={!doc.half_day ? "default" : "outline"}
              disabled={isDisabled}
              onClick={() => setDoc({ ...doc, half_day: 0 })}
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        <FormField label={t("requests.leave.reason")} name="reason">
          <Textarea
            disabled={isDisabled}
            rows={3}
            value={doc.reason}
            onChange={(e) => setDoc({ ...doc, reason: e.target.value })}
          />
        </FormField>
      </FormSection>
    </div>
  );
}
