import { Children, cloneElement, isValidElement } from "react";
import { gridCorners } from "../../lib/gridCorners";

const BREAKPOINTS = [{ cols: 2 }, { min: "md", cols: 4 }];

/**
 * Responsive KPI row: 2-col mobile → 4-col desktop.
 * children are StatCard instances — outer-perimeter corners injected per cell.
 */
export default function StatRow({ children }) {
  if (!children || (Array.isArray(children) && children.filter(Boolean).length === 0)) {
    return null;
  }

  const items = Children.toArray(children).filter(Boolean);
  const count = items.length;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((child, i) => {
        if (!isValidElement(child)) return child;
        const corners = gridCorners({ breakpoints: BREAKPOINTS, index: i, count });
        return cloneElement(child, {
          key: child.key ?? i,
          className: [child.props.className, corners].filter(Boolean).join(" "),
        });
      })}
    </div>
  );
}
