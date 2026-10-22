import ActionTile from "../ActionTile";
import { gridCorners } from "../../lib/gridCorners";
import { cn } from "cn";

/**
 * The class each column count lays out as.
 *
 * FOUR is the default, and it is a real saving rather than a cosmetic one:
 * ActionTile clamps both its title and its description with `truncate`, so a
 * tile's height is set by its icon block and padding, not by its text. A
 * narrower column clips the label instead of wrapping it, so rows are
 * removed rather than made taller.
 *
 * `1` is here for a section that holds a single tile, which reads better
 * full width than as a lonely quarter.
 *
 * No `2xl` step. The breakpoint exists in the Tailwind theme, but this build
 * emits no `2xl:` utility at all -- a pre-existing `2xl:col-span-*` in
 * ApprovalPreview is missing from the built CSS too. Adding one would have
 * looked correct and done nothing.
 */
const COL_CLASSES = {
  1: "grid-cols-1",
  2: "grid-cols-1 xl:grid-cols-2",
  3: "grid-cols-1 xl:grid-cols-3",
  4: "grid-cols-1 xl:grid-cols-4",
};

/**
 * Uniform ActionTile grid.
 *
 * `cols` is how many columns the grid lays out at `xl` and up; one column
 * below that. It defaults to four, which is what every hub has always used.
 *
 * items: tile objects; onClick(tile, isCreate?) shared handler.
 * Outer-perimeter corners injected per cell via gridCorners.
 */
export default function ModuleGrid({ items = [], onClick, cols = 4 }) {
  if (!items.length) return null;

  const columnCount = COL_CLASSES[cols] ? cols : 4;

  // The breakpoints MUST list the same steps as the grid class, in the same
  // order: `gridCorners` is currently inert -- a deliberate no-op -- which is
  // exactly why it needs this. An array nothing reads rots silently, and the
  // day corner rounding is re-enabled it would be computing for one number
  // of columns while the CSS lays out another.
  const breakpoints =
    columnCount > 1
      ? [{ cols: 1 }, { min: "xl", cols: columnCount }]
      : [{ cols: 1 }];

  return (
    <div className={cn("grid gap-4", COL_CLASSES[columnCount])}>
      {items.map((tile, i) => (
        <ActionTile
          key={tile.key ?? tile.route ?? tile.title ?? i}
          tile={tile}
          onClick={onClick}
          className={gridCorners({
            breakpoints,
            index: i,
            count: items.length,
          })}
        />
      ))}
    </div>
  );
}
