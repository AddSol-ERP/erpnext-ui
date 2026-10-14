import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Observe an element's content-box width.
 *
 * Exists for the one decision that CSS media queries cannot make: whether the
 * filters fit *in this container* right now. A breakpoint knows the viewport
 * width, but the toolbar is only part of it -- and the filter count varies per
 * report, so "5 filters" and "3 filters" want to collapse at different widths.
 *
 * Returns a ref to attach, plus the width. Starts at 0 so the first render can
 * assume "no space" and show the compact control, rather than flashing a row of
 * filters that then wrap.
 */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const next = node.getBoundingClientRect().width;
    // Fractional widths jitter by a pixel or two on every scrollbar change;
    // rounding avoids re-rendering (and re-collapsing) for nothing.
    setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : Math.round(next)));
  }, []);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [measure]);

  return [ref, width];
}