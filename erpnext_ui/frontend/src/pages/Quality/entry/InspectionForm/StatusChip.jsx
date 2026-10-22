import { CircleCheck, CircleX, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";

/**
 * The status chip: an icon and the verdict, in one place.
 *
 * Shared by the question card, the rail's summary and the review, so a
 * reading and the inspection it belongs to always read the same way.
 *
 * Amber is NOT used for "Pending". A pending reading is a NORMAL state during
 * an inspection -- there is one per question until you answer it -- and a
 * colour that loud would make every unfinished reading look like an error.
 * The app's own `statusTone` table maps "Pending" to amber, which is right
 * for a DOCUMENT badge and wrong for a reading.
 */
function statusChipClass(status) {
  if (status === "Accepted") {
    return "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30";
  }
  if (status === "Rejected") {
    return "bg-destructive/15 text-destructive ring-destructive/30";
  }
  return "bg-muted text-muted-foreground ring-border";
}

export default function StatusChip({ status, className }) {
  const { t } = useTranslation();

  const label =
    status === "Accepted"
      ? t("quality.statusAccepted")
      : status === "Rejected"
        ? t("quality.statusRejected")
        : t("quality.statusPending");

  const Icon =
    status === "Accepted" ? CircleCheck : status === "Rejected" ? CircleX : Clock;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 px-2 py-0.5 text-[11px] font-semibold ring-1",
        statusChipClass(status),
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
