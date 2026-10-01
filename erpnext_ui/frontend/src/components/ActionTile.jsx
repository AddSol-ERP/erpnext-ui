import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const DEFAULT_COLOR = "var(--brand-primary)";

/**
 * Module tile used across hub pages (Dashboard, HR, Sales, ...).
 * API unchanged: { tile: { icon, title, description, color?, badge?, createRoute?, titleKey?, descriptionKey? }, onClick }
 * `tile.icon` accepts either a legacy bootstrap icon class string
 * ("bi-box-seam") or a React component (lucide icons).
 * Optional `titleKey`/`descriptionKey` resolve through i18next when present.
 * Sharp base — corners injected by parent via gridCorners.
 */
export default function ActionTile({ tile, onClick, className = "" }) {
  const { t } = useTranslation();
  const color = tile.color || DEFAULT_COLOR;
  const Icon = tile.icon;
  const isStringIcon = typeof Icon === "string";
  const title = tile.titleKey ? t(tile.titleKey) : tile.title;
  const description = tile.descriptionKey
    ? t(tile.descriptionKey)
    : tile.description;

  return (
    <div
      className={`group flex h-full cursor-pointer flex-col bg-card p-4 text-card-foreground ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/40 ${className}`}
      onClick={() => onClick(tile)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(tile);
        }
      }}
    >
      {/* HEADER */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
        >
          {isStringIcon ? (
            <i className={Icon} style={{ color, fontSize: 20 }} />
          ) : (
            <Icon className="size-5" style={{ color }} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {description}
          </div>
        </div>

        {tile.badge ? (
          <Badge
            variant="outline"
            className="shrink-0 bg-destructive/15 text-destructive ring-destructive/30 dark:text-destructive"
          >
            {tile.badge}
          </Badge>
        ) : null}
      </div>

      {/* FOOTER */}
      <div className="mt-auto flex justify-end">
        {tile.createRoute && (
          <button
            className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/85"
            onClick={(e) => {
              e.stopPropagation();
              onClick(tile, true);
            }}
            aria-label="Create"
            type="button"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
