/** Resolve URL drafts only from the permission-filtered project workspace. */
export function resolvePlanningBomDraft(requestedName, localDraft, availableDrafts = []) {
  if (!requestedName) return localDraft;
  if (!availableDrafts.some((bom) => bom.name === requestedName && Number(bom.docstatus) === 0)) return null;
  return localDraft?.name === requestedName ? localDraft : { name: requestedName, initialState: null };
}
