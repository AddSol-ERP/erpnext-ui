import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * Width presets.
 *
 * Every entry is written as a full literal class string on purpose: Tailwind
 * scans source text statically, so a preset assembled at runtime (e.g.
 * `` `sm:${u}` ``) never makes it into the generated stylesheet.
 *
 * Each preset keeps the `calc(100%-2rem)` gutter below 640px and only applies
 * the real width from the `sm:` breakpoint up. `DialogContent`'s own default
 * is unprefixed, so there is no competing `sm:max-w-*` rule to out-order —
 * the width applied here is deterministic.
 */
const widthMap = {
  sm: "max-w-[calc(100%-2rem)] sm:max-w-sm",
  md: "max-w-[calc(100%-2rem)] sm:max-w-xl",
  lg: "max-w-[calc(100%-2rem)] sm:max-w-3xl",
  xl: "max-w-[calc(100%-2rem)] sm:max-w-[80rem]",
  full: "max-w-[calc(100%-2rem)] sm:max-w-[95vw]",
  fullscreen:
    "max-w-none sm:max-w-none w-[100vw] h-[100vh] rounded-none",
};

/**
 * App-level modal built on shadcn Dialog.
 * API unchanged: { show, onClose, title, children, footer, width }
 *
 * `width` presets: sm | md | lg | xl | full | fullscreen
 */
export default function AppModal({
  show,
  onClose,
  title,
  children,
  footer,
  width = "md",
}) {
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[95vh] flex-col gap-0 overflow-hidden p-0",
          widthMap[width] || widthMap.md,
        )}
      >
        {/* HEADER */}
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base font-semibold">
            {title}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute end-3 top-3.5"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </DialogHeader>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
          {children}
        </div>

        {/* FOOTER */}
        {footer && (
          <DialogFooter className="sticky bottom-0 border-t border-border bg-card px-5 py-3">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
