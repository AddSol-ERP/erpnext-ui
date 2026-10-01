import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "cn";

const widthMap = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

/**
 * Slide-over panel built on shadcn Sheet (opens from the inline-end side,
 * so it flips automatically in RTL).
 * API unchanged: { show, onClose, title, children, width }
 */
export default function RightDrawer({
  show,
  onClose,
  title,
  children,
  width = "md",
}) {
  return (
    <Sheet open={show} onOpenChange={(open) => !open && onClose?.()}>
      <SheetContent
        side="end"
        className={cn("flex w-full flex-col gap-0 p-0", widthMap[width] || widthMap.md)}
      >
        {/* HEADER */}
        <SheetHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">{title}</SheetTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </SheetHeader>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-8">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
