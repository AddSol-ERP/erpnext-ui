/**
 * The in-progress inspection, kept OUTSIDE React.
 *
 * WHY NOT A CONTEXT
 * -----------------
 * The draft has to outlive the form component: the user walks away to the
 * inspection list and comes back, and the answers must still be there. A
 * provider mounted above the routes would do that -- but the only provider
 * that survives a route change sits at the app ROOT (`main.jsx`), so holding
 * the draft in React state there would re-render the entire tree on every
 * keystroke.
 *
 * An external store notifies only its subscribers, so the LIST re-renders
 * when a draft appears and the FORM -- which writes to the store
 * imperatively and never subscribes -- is unaffected.
 *
 * WHY IN MEMORY, NOT sessionStorage
 * ----------------------------------
 * The draft answers one question: "the user left the paper half-finished and
 * wants to come back to it". A browser reload is a different problem, and
 * storing the answers in the browser would quietly put inspection data on a
 * shared tablet's disk. The document itself is saved to the server by the
 * Save button; this is only the in-between.
 */

/** @type {{doc: object, parameters: object[], questionIndex: number, savedAt: number}|null} */
let draft = null;

const listeners = new Set();

/**
 * The current draft, or null.
 *
 * The returned reference is STABLE until the draft changes -- that is what
 * `useSyncExternalStore` requires, and it is why `setInspectionDraft` always
 * replaces the object rather than mutating it.
 */
export function getInspectionDraft() {
  return draft;
}

/**
 * Replace the draft.
 *
 * Always pass a NEW object. Mutating the stored one in place would leave
 * `getSnapshot` returning the same reference with different contents, and
 * `useSyncExternalStore` would not see a change.
 */
export function setInspectionDraft(next) {
  draft = next && next.parameters ? next : null;
  listeners.forEach((listener) => listener());
}

/** Forget the draft. Called when the document is saved or submitted. */
export function clearInspectionDraft() {
  setInspectionDraft(null);
}

/**
 * Listen for draft changes.
 *
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeInspectionDraft(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
