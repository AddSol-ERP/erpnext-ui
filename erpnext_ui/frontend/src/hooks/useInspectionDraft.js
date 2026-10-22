import { useSyncExternalStore } from "react";
import {
  getInspectionDraft,
  subscribeInspectionDraft,
} from "../lib/inspectionDraft";

/**
 * The in-progress inspection, if there is one.
 *
 * `useSyncExternalStore` is the right tool for an external store: only the
 * components that READ the draft re-render when it changes. A context would
 * re-render every subscriber, and the provider that could hold it across a
 * route change sits at the app root.
 *
 * The third argument is the server snapshot. Without it, `renderToString`
 * throws -- and the smoke suites render pages.
 */
export function useInspectionDraft() {
  return useSyncExternalStore(
    subscribeInspectionDraft,
    getInspectionDraft,
    getInspectionDraft,
  );
}
