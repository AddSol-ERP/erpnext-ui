import { Children, cloneElement, isValidElement } from "react";
import { gridCorners } from "../../lib/gridCorners";

const BREAKPOINTS = [{ cols: 1 }, { min: "md", cols: 2 }];

/**
 * Responsive chart grid: 1-col mobile → 2-col desktop.
 * Injects outer-perimeter corners into each ChartPanel child.
 */
export default function ChartGrid({ children, className = "" }) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) return null;

  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${className}`}>
      {items.map((child, i) => {
        if (!isValidElement(child)) return child;
        const corners = gridCorners({
          breakpoints: BREAKPOINTS,
          index: i,
          count: items.length,
        });
        return cloneElement(child, {
          key: child.key ?? i,
          className: [child.props.className, corners].filter(Boolean).join(" "),
        });
      })}
    </div>
  );
}
