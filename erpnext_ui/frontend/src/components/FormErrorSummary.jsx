import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorList } from "../lib/formValidation";
import { cn } from "cn";

/**
 * Top-of-form error summary — destructive tint + icon (premium look).
 * Renders every message in fieldErrors (or a single summary string).
 */
export default function FormErrorSummary({ summary, fieldErrors, title, className }) {
  const list = errorList(fieldErrors);
  const message = summary || list[0];

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
