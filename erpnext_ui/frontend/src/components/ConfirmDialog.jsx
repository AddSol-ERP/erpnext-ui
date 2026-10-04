import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import AppModal from "./AppModal";
import { Button } from "@/components/ui/button";

/**
 * Confirmation dialog built on the app's own AppModal (shadcn Dialog).
 *
 * Replaces `window.confirm`, which renders a browser-native alert that ignores
 * the app's theme, language and RTL direction, and cannot be styled or given a
 * busy state.
 *
 * API:
 *   open            show/hide
 *   onCancel        dismissed (close button, Escape, overlay, Cancel button)
 *   onConfirm       confirmed
 *   title           heading
 *   message         body text
 *   confirmLabel    override the default "Delete"
 *   variant         "destructive" (default) | "default"
 *   loading         disables both buttons and shows a busy confirm label
 */
export default function ConfirmDialog({
  open = false,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmLoadingLabel,
  cancelLabel,
  variant = "destructive",
  loading = false,
  icon = true,
}) {
  const { t } = useTranslation();

  const confirmText = loading
    ? (confirmLoadingLabel ?? t("common.deleting"))
    : (confirmLabel ?? t("common.delete"));

  return (
    <AppModal
      show={open}
      onClose={loading ? undefined : onCancel}
      title={title ?? t("common.deleteConfirmTitle")}
      width="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t("common.cancel")}
          </Button>

          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {icon && (
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-full " +
              (variant === "destructive"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary")
            }
          >
            <AlertTriangle className="size-5" />
          </span>
        )}

        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </AppModal>
  );
}
