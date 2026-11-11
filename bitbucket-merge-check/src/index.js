// Bitbucket merge check: the same test-tampering rules as the Jira app, run before the pull request merges.
import api, { route } from "@forge/api";
import { findTampering } from "../../src/lib/tamper.js";
import { describeFindings } from "./describe.js";

export async function check({ workspace, repository, pullrequest }) {
  const res = await api.asApp().requestBitbucket(route`/2.0/repositories/${workspace.uuid}/${repository.uuid}/pullrequests/${pullrequest.id}/diff`);
  if (!res.ok) return { success: false, message: `Proof of Done could not read this pull request's diff (Bitbucket ${res.status}).` };
  return describeFindings(findTampering(await res.text()));
}
