import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RotateCw,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

function ToastContainer({ toasts, removeToast }) {
  const { t } = useTranslation();

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="size-4 text-emerald-500" />;
      case "error":
        return <XCircle className="size-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="size-4 text-amber-500" />;
      case "info":
        return <Info className="size-4 text-sky-500" />;
      default:
        return <RotateCw className="size-4 text-muted-foreground" />;
    }
  };

  const accentClass = (type) => {
    switch (type) {
      case "success":
        return "border-s-2 border-emerald-500";
      case "error":
        return "border-s-2 border-destructive";
      case "warning":
        return "border-s-2 border-amber-500";
      case "info":
        return "border-s-2 border-sky-500";
      default:
        return "border-s-2 border-primary";
    }
  };

  return (
    <div className="pointer-events-none fixed end-4 top-4 z-[3000] flex w-80 flex-col gap-2">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`pointer-events-auto relative flex items-start gap-2 overflow-hidden rounded-none bg-card p-3 text-card-foreground shadow-lg ring-1 ring-foreground/10 ${accentClass(toastItem.type)}`}
        >
          {/* LEFT ICON */}
          <div className="mt-0.5 shrink-0">
            {toastItem.type === "loading" ? (
              <Spinner className="size-4 text-primary" />
            ) : (
              getIcon(toastItem.type)
            )}
          </div>

          {/* CONTENT */}
          <div className="min-w-0 flex-grow">
            <div className="text-sm break-words">{toastItem.message}</div>

            {toastItem.description && (
              <div className="text-xs text-muted-foreground">
                {toastItem.description}
              </div>
            )}
          </div>

          {/* CLOSE */}
          <button
            type="button"
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => removeToast(toastItem.id)}
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>

          {/* PROGRESS BAR */}
          {!toastItem.persist && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/70" />
          )}
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
