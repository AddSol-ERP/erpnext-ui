/**
 * Maps legacy Bootstrap action variants (used across all pages'
 * setHeader calls) onto shadcn Button variants without touching pages.
 */
export function mapVariant(variant = "") {
  switch (variant) {
    case "btn-success":
      return {
        variant: "default",
        className: "bg-emerald-600 text-white hover:bg-emerald-600/85",
      };
    case "btn-outline-primary":
      return {
        variant: "outline",
        className: "border-primary/40 text-primary hover:bg-primary/10",
      };
    case "btn-outline-secondary":
      return { variant: "outline", className: "" };
    case "btn-outline-danger":
      return { variant: "destructive", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

export default mapVariant;
