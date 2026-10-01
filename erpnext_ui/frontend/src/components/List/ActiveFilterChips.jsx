import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Removable pills for active list filters (lives inside ActionBar row 2).
 * chips: [{ id, label, value, onRemove }]
 */
export default function ActiveFilterChips({ chips = [], onClearAll, className }) {
  const { t } = useTranslation();

  if (!chips.length) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="list"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          role="listitem"
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/30"
        >
          <span className="truncate">
            {chip.label}
            {chip.value != null && chip.value !== "" ? `: ${chip.value}` : ""}
          </span>
          {chip.onRemove ? (
            <button
              type="button"
              className="flex size-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={chip.onRemove}
              aria-label={`${t("common.clear")} ${chip.label}`}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}

      {onClearAll && chips.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 rounded-full px-2 text-xs text-muted-foreground"
          onClick={onClearAll}
        >
          {t("common.clear")}
        </Button>
      )}
    </div>
  );
}
