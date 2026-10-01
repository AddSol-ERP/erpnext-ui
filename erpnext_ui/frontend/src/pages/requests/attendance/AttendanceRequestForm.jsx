import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, FileText, SlidersHorizontal } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { FormField } from "../../../components/FormField";
import FormSection from "../../../components/FormSection";
import FormErrorSummary from "../../../components/FormErrorSummary";
import FormSelect from "../../../components/FormSelect";
import { focusFirstError } from "../../../lib/formValidation";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DATE_LOCALES = { en: "en-IN", hi: "hi-IN", ar: "ar" };

const parseIsoDate = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const formatDayMonth = (value, locale) =>
  parseIsoDate(value).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });

export default function AttendanceRequestForm() {
  const { name } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t, i18n } = useTranslation();

  const isEdit = !!name;
  const lang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const dateLocale = DATE_LOCALES[lang] || DATE_LOCALES.en;

  // Pre-fill from URL search params (used when navigating from attendance calendar)
  const prefilledFromDate = searchParams.get("from_date") || "";
  const prefilledToDate = searchParams.get("to_date") || "";

  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [doc, setDoc] = useState({
    employee: "",
    company: "",
    from_date: prefilledFromDate,
    to_date: prefilledToDate || prefilledFromDate,
    half_day: 0,
    half_day_date: "",
    include_holidays: 0,
    shift: "",
    reason: "",
    explanation: "",
  });

  /* ================= AUTO EMPLOYEE ================= */
  // autoSetEmployee setStates after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function autoSetEmployee() {
    try {
      const res = await get("method/frappe.client.get_list", {
        doctype: "Employee",
        fields: JSON.stringify(["name", "company"]),
        limit_page_length: 2,
      });

      const list = res.message || [];

      if (list.length === 1) {
        setDoc((prev) => ({
          ...prev,
          employee: list[0].name,
          company: list[0].company,
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!isEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      autoSetEmployee();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= LOAD ================= */
  // loadDoc setStates only after awaited API responses; the compiler
  // rule conservatively flags any setState-reaching call from an effect.
  async function loadDoc() {
    try {
      setLoading(true);

      const res = await get(`resource/Attendance Request/${name}`);
      const d = res.data;

      setDoc({
        employee: d.employee || "",
        company: d.company || "",
        from_date: d.from_date || "",
        to_date: d.to_date || "",
        half_day: d.half_day || 0,
        half_day_date: d.half_day_date || "",
        include_holidays: d.include_holidays || 0,
        shift: d.shift || "",
        reason: d.reason || "",
        explanation: d.explanation || "",
      });

      if (d.docstatus === 1) setIsSubmitted(true);
    } catch (e) {
      console.error(e);
      setError(t("requests.attendance.loadFailed"));
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

  /* ================= VALIDATION ================= */
  const validate = () => {
    const errs = {};

    if (!doc.employee) {
      errs.employee = t("common.fieldRequired", {
        field: t("requests.attendance.employee"),
      });
    }
    if (!doc.from_date) {
      errs.from_date = t("common.fieldRequired", {
        field: t("requests.attendance.fromDate"),
      });
    }
    if (!doc.to_date) {
      errs.to_date = t("common.fieldRequired", {
        field: t("requests.attendance.toDate"),
      });
    }
    if (!doc.reason) {
      errs.reason = t("common.fieldRequired", {
        field: t("requests.attendance.reason"),
      });
    }
    if (doc.from_date && doc.to_date && doc.to_date < doc.from_date) {
      errs.to_date = t("requests.attendance.validationRange");
    }
    if (doc.half_day && !doc.half_day_date) {
      errs.half_day_date = t("requests.attendance.validationHalfDayDate");
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

    try {
      setLoading(true);
      setError("");

      if (isEdit) {
        await post(`resource/Attendance Request/${name}`, doc);
      } else {
        await post("resource/Attendance Request", doc);
      }

      navigate("/requests/attendance");
    } catch (e) {
      console.error(e);
      setError(t("common.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("requests.header.attendanceEditTitle", { name })
        : t("requests.header.attendanceNewTitle"),

      subtitle: isEdit
        ? t("requests.header.attendanceEditSubtitle")
        : t("requests.header.attendanceNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.requests"), path: "/requests" },
        {
          label: t("requests.header.attendanceListTitle"),
          path: "/requests/attendance",
        },
        {
          label: isEdit ? name : t("common.new"),
        },
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

  const isDisabled = isSubmitted;

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-3 pt-4">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      {/* BASIC */}
      <FormSection
        title={t("requests.attendance.sectionDetails")}
        icon={CalendarDays}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <FormField
          label={t("requests.attendance.employee")}
          required
          name="employee"
          error={fieldErrors.employee}
        >
          {isDisabled ? (
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

        <FormField
          label={t("requests.attendance.company")}
          required
          name="company"
          error={fieldErrors.company}
        >
          {isDisabled ? (
            <Input value={doc.company} disabled />
          ) : (
            <LinkField
              doctype="Company"
              value={doc.company}
              disabled={isDisabled}
              onChange={(v) => setDoc({ ...doc, company: v })}
            />
          )}
        </FormField>

        <FormField
          label={t("requests.attendance.fromDate")}
          required
          name="from_date"
          error={fieldErrors.from_date}
        >
          <Input
            type="date"
            disabled={isDisabled}
            value={doc.from_date}
            onChange={(e) => {
              const val = e.target.value;
              setDoc({
                ...doc,
                from_date: val,
                to_date: doc.to_date || val,
              });
            }}
          />
        </FormField>

        <FormField
          label={t("requests.attendance.toDate")}
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
      </FormSection>

      {/* OPTIONS */}
      <FormSection
        title={t("requests.attendance.sectionOptions")}
        icon={SlidersHorizontal}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField label={t("requests.attendance.halfDay")} name="half_day">
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={doc.half_day ? "default" : "outline"}
              onClick={() =>
                setDoc({ ...doc, half_day: 1, half_day_date: "" })
              }
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={!doc.half_day ? "default" : "outline"}
              onClick={() =>
                setDoc({ ...doc, half_day: 0, half_day_date: "" })
              }
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        {doc.half_day === 1 && (
          <FormField
            label={t("requests.attendance.halfDayDate")}
            name="half_day_date"
            error={fieldErrors.half_day_date}
          >
            {/* QUICK SELECT PILLS */}
            <div className="mt-1 flex flex-wrap gap-2">
              {doc.from_date &&
                doc.to_date &&
                (() => {
                  const dates = [];
                  let current = new Date(doc.from_date);
                  const end = new Date(doc.to_date);

                  while (current <= end) {
                    const d = current.toISOString().split("T")[0];
                    dates.push(d);
                    current.setDate(current.getDate() + 1);
                  }

                  // avoid UI clutter
                  if (dates.length > 7) return null;

                  return dates.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="xs"
                      disabled={isDisabled}
                      variant={
                        doc.half_day_date === d ? "default" : "outline"
                      }
                      onClick={() => setDoc({ ...doc, half_day_date: d })}
                    >
                      {formatDayMonth(d, dateLocale)}
                    </Button>
                  ));
                })()}
            </div>

            {/* FALLBACK DATE PICKER */}
            <div className="mt-2">
              <Input
                type="date"
                disabled={isDisabled}
                min={doc.from_date}
                max={doc.to_date}
                value={doc.half_day_date}
                onChange={(e) =>
                  setDoc({ ...doc, half_day_date: e.target.value })
                }
              />
            </div>

            {/* HELPER TEXT */}
            {!fieldErrors.half_day_date && (
              <small className="text-xs text-muted-foreground">
                {t("requests.attendance.halfDayHint")}
              </small>
            )}
          </FormField>
        )}

        <FormField
          label={t("requests.attendance.includeHolidays")}
          name="include_holidays"
        >
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={doc.include_holidays ? "default" : "outline"}
              onClick={() => setDoc({ ...doc, include_holidays: 1 })}
            >
              {t("common.yes")}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isDisabled}
              variant={!doc.include_holidays ? "default" : "outline"}
              onClick={() => setDoc({ ...doc, include_holidays: 0 })}
            >
              {t("common.no")}
            </Button>
          </div>
        </FormField>

        <FormField label={t("requests.attendance.shift")} name="shift">
          {isDisabled ? (
            <Input value={doc.shift} disabled />
          ) : (
            <LinkField
              doctype="Shift Type"
              value={doc.shift}
              disabled={isDisabled}
              onChange={(v) => setDoc({ ...doc, shift: v })}
            />
          )}
        </FormField>
      </FormSection>

      {/* REASON */}
      <FormSection
        title={t("requests.attendance.reason")}
        icon={FileText}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <FormField
          label={t("requests.attendance.reason")}
          required
          name="reason"
          error={fieldErrors.reason}
        >
          <FormSelect
            value={doc.reason}
            disabled={isDisabled}
            placeholder={t("requests.attendance.select")}
            onChange={(v) => setDoc({ ...doc, reason: v })}
            options={[
              ["Work From Home", t("requests.attendance.workFromHome")],
              ["On Duty", t("requests.attendance.onDuty")],
            ]}
          />
        </FormField>

        <FormField
          label={t("requests.attendance.explanation")}
          name="explanation"
        >
          <Textarea
            rows={3}
            disabled={isDisabled}
            value={doc.explanation}
            onChange={(e) =>
              setDoc({ ...doc, explanation: e.target.value })
            }
          />
        </FormField>
      </FormSection>
    </div>
  );
}
