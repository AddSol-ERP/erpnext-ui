import { useTranslation } from "react-i18next";

const LEGEND = [
  {
    labelKey: "reports.present",
    className: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30",
  },
  {
    labelKey: "reports.absent",
    className: "bg-destructive/15 text-destructive ring-destructive/30",
  },
  {
    labelKey: "reports.halfDay",
    className: "bg-amber-500/15 text-amber-600 ring-amber-500/30",
  },
  {
    labelKey: "reports.leave",
    className: "bg-primary/15 text-primary ring-primary/30",
  },
  {
    labelKey: "reports.weeklyOff",
    className:
      "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl bg-slate-500 px-2 py-0.5 text-xs font-medium text-white",
  },
  {
    labelKey: "reports.holiday",
    className:
      "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl bg-teal-500 px-2 py-0.5 text-xs font-medium text-white",
  },
];

export default function AttendanceLegend() {
  const { t } = useTranslation();

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {LEGEND.map((item) => (
        <span
          key={item.labelKey}
          className={
            item.className ||
            "inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl px-2 py-0.5 text-xs font-medium"
          }
        >
          {t(item.labelKey)}
        </span>
      ))}
    </div>
  );
}
