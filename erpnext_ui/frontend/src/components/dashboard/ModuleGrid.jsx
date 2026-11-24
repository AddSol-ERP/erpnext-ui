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
 */
const COL_CLASSES = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

/**
 * Uniform ActionTile grid.
 *
 * `cols` is the maximum column count; the grid grows from one column on
 * small screens to that maximum as space becomes available.
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
  const breakpoints = [
    { cols: 1 },
    ...(columnCount >= 2 ? [{ min: "sm", cols: 2 }] : []),
    ...(columnCount >= 3 ? [{ min: "lg", cols: 3 }] : []),
    ...(columnCount >= 4 ? [{ min: "xl", cols: 4 }] : []),
  ];

  return (
    <div className={cn("grid gap-2", COL_CLASSES[columnCount])}>
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
