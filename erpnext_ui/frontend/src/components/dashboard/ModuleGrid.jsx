import ActionTile from "../ActionTile";
import { gridCorners } from "../../lib/gridCorners";
import { cn } from "cn";

const COL_CLASSES = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export default function ModuleGrid({ items = [], onClick, cols = 4, mobileCols = 1 }) {
  if (!items.length) return null;
  const count = COL_CLASSES[cols] ? cols : 4;
  const mobile = mobileCols === 2 && count > 1 ? 2 : 1;
  const breakpoints = [{ cols: mobile }, ...(count >= 2 ? [{ min: "sm", cols: 2 }] : []), ...(count >= 3 ? [{ min: "lg", cols: 3 }] : []), ...(count >= 4 ? [{ min: "xl", cols: 4 }] : [])];
  return <div className={cn("grid gap-2", mobile === 2 ? "grid-cols-2" : "grid-cols-1", COL_CLASSES[count])}>
    {items.map((tile, index) => <ActionTile key={tile.key ?? tile.route ?? tile.title ?? index} tile={tile} onClick={onClick} className={gridCorners({ breakpoints, index, count: items.length })} />)}
  </div>;
}
