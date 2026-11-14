// What the Done trigger leaves on a work item: an audit receipt, a warning note, or nothing for a project
// Proof of Done does not check (the trigger runs for every work item on the site).
export function afterDone(v) {
  if (v.done) return "receipt";
  return v.repo ? "note" : null;
}
