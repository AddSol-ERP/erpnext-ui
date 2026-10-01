import ActionTile from "../ActionTile";
import { gridCorners } from "../../lib/gridCorners";

const BREAKPOINTS = [{ cols: 1 }, { min: "sm", cols: 2 }, { min: "lg", cols: 3 }];

/**
 * Uniform ActionTile grid: 1 → 2 → 3 columns.
 * items: tile objects; onClick(tile, isCreate?) shared handler.
 * Outer-perimeter corners injected per cell via gridCorners.
 */
export default function ModuleGrid({ items = [], onClick }) {
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
