import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorList } from "../lib/formValidation";
import { cn } from "cn";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Top-of-form error summary — destructive tint + icon (premium look).
 * Renders every message in fieldErrors (or a single summary string).
 */
export default function FormErrorSummary({ summary, fieldErrors, title, className, toastOnly = false }) {
  const list = errorList(fieldErrors);
  const message = summary || list[0];
  const toastMessage = list.length > 1 ? [summary, ...list].filter(Boolean).join(" · ") : message;

  useEffect(() => {
    if (toastOnly && toastMessage) toast.error(toastMessage, { id: "ess-form-error" });
  }, [toastOnly, toastMessage, fieldErrors]);

  if (toastOnly) return null;

  if (!message && list.length === 0) return null;

  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      <AlertCircle />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="text-destructive">
        {list.length > 1 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {list.map((msg, i) => (
              <li key={`${msg}-${i}`}>{msg}</li>
            ))}
          </ul>
        ) : (
          message
        )}
      </AlertDescription>
    </Alert>
  );
}
