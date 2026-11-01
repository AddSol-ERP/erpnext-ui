import { useTranslation } from "react-i18next";
export default function ProductionTabs({ value, counts, onChange }) {
  const { t } = useTranslation();
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2" role="group" aria-label={t("common.status")}>
    {["all", "ongoing", "waiting", "completed"].map((key) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${value === key ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"}`}>
      {t(key === "all" ? "store.scopes.all" : `production.tab${key[0].toUpperCase()}${key.slice(1)}`)}{counts[key] != null ? ` (${counts[key]})` : ""}
    </button>)}
  </div>;
}
