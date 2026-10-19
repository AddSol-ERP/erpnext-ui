import ActionTile from "../ActionTile";
import { gridCorners } from "../../lib/gridCorners";

// Must list the same steps as the grid class below, in the same order.
// Currently inert -- gridCorners is a deliberate no-op -- which is exactly why
// it needs an assertion: an array nothing reads rots silently, and the day
// corner rounding is re-enabled it would be computing for three columns while
// the CSS lays out five.
const BREAKPOINTS = [
  { cols: 1 },
  { min: "xl", cols: 4 },
];

/**
 * Uniform ActionTile grid: one column, four from `xl` up.
 *
 * Four columns is a real saving rather than a cosmetic one: ActionTile clamps
 * both its title and its description with `truncate`, so a tile's height is set
 * by its icon block and padding, not by its text. A narrower column clips the
 * label instead of wrapping it, so rows are removed rather than made taller.
 *
 * No `2xl` step. The breakpoint exists in the Tailwind theme, but this build
 * emits no `2xl:` utility at all -- a pre-existing `2xl:col-span-*` in
 * ApprovalPreview is missing from the built CSS too. Adding one would have
 * looked correct and done nothing.
 * items: tile objects; onClick(tile, isCreate?) shared handler.
 * Outer-perimeter corners injected per cell via gridCorners.
 */
export default function ModuleGrid({ items = [], onClick }) {
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
      {items.map((tile, i) => (
        <ActionTile
          key={tile.key ?? tile.route ?? tile.title ?? i}
          tile={tile}
          onClick={onClick}
          className={gridCorners({
            breakpoints: BREAKPOINTS,
            index: i,
            count: items.length,
          })}
        />
      ))}
    </div>
  );
}
