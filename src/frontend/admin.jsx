// Admin page: which GitHub repository each Jira project uses, and an optional read-only token.
import React, { useEffect, useState } from "react";
import ForgeReconciler, { Button, Code, ErrorMessage, HelperMessage, Inline, Label, SectionMessage, Spinner, Stack, Strong, Text, TextArea, Textfield } from "@forge/react";
import { invoke } from "@forge/bridge";

// Preview, then apply: the validator and condition on the chosen project's transitions into Done.
function Setup() {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke("projects").then((list) => setProjects(Array.isArray(list) ? list : [])).catch(() => setProjects([]));
  }, []);

  const look = async (key) => {
    setProject(key);
    setResult(null);
    setPreview(null);
    setBusy(true);
    setPreview(await invoke("previewSetup", { projectKey: key }));
    setBusy(false);
  };
  const apply = async () => {
    setBusy(true);
    setResult(await invoke("applySetup", { projectKey: project }));
    setPreview(await invoke("previewSetup", { projectKey: project }));
    setBusy(false);
  };

  const changes = preview?.plans?.flatMap((p) => p.changes.map((c) => ({ ...c, workflow: p.workflow }))) ?? [];
  return (
    <Stack space="space.150">
      <Strong>Turn it on for a project</Strong>
      <Text>Choose a project to preview the change:</Text>
      <Inline space="space.100" shouldWrap>
        {projects.map((p) => (
          <Button key={p.key} appearance={project === p.key ? "primary" : "default"} onClick={() => look(p.key)}>
            {`${p.name} (${p.key})`}
          </Button>
        ))}
      </Inline>
      {busy && !result ? <Spinner label="Reading the workflow" /> : null}
      {preview && !preview.ok ? <SectionMessage appearance="error" title="Could not read the workflow"><Text>{preview.message}</Text></SectionMessage> : null}
      {preview?.ok && preview.teamManaged ? (
        <SectionMessage appearance="information" title="Team-managed project">
          <Text>Open the project's settings, then Workflow, select the transition into Done and add the Proof of Done rule there.</Text>
        </SectionMessage>
      ) : null}
      {preview?.ok && !preview.teamManaged && changes.length ? (
        <SectionMessage appearance="information" title="Nothing changes until you press Apply">
          <Stack space="space.050">
            {changes.map((c, i) => (
              <Text key={i}>
                • {c.workflow}: the "{c.transition}" transition (to {c.to}) gets the {c.add.join(" and ")}.
              </Text>
            ))}
            <Inline space="space.100">
              <Button appearance="primary" onClick={apply} isDisabled={busy}>
                Apply
              </Button>
            </Inline>
          </Stack>
        </SectionMessage>
      ) : null}
      {preview?.ok && !preview.teamManaged && !changes.length && preview.plans.length ? <SectionMessage appearance="success" title={`Proof of Done is on for ${preview.project}`} /> : null}
      {result && !result.ok ? <SectionMessage appearance="error" title="Could not update the workflow"><Text>{result.message}</Text></SectionMessage> : null}
    </Stack>
  );
}

function Admin() {
  const [repos, setRepos] = useState(null);
  const [token, setToken] = useState("");
  const [skipLabel, setSkipLabel] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [bbToken, setBbToken] = useState("");
  const [hasBbToken, setHasBbToken] = useState(false);
  const [problems, setProblems] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke("getSettings").then((s) => {
      setRepos(s.repos);
      setSkipLabel(s.skipLabel);
      setHasToken(s.hasToken);
      setHasBbToken(s.hasBitbucketToken);
    });
  }, []);

  const save = async (clearToken = false) => {
    setBusy(true);
    setSaved(false);
    const r = await invoke("saveSettings", { repos, token, clearToken, skipLabel, bitbucketToken: bbToken, clearBitbucketToken: clearToken });
    setProblems(r.problems);
    if (r.ok) {
      setSaved(true);
      setToken("");
      setBbToken("");
      setHasToken(r.hasToken);
      setHasBbToken(r.hasBitbucketToken);
    }
    setBusy(false);
  };

  if (repos === null) return <Spinner label="Loading settings" />;

  return (
    <Stack space="space.300">
      <Text>A work item moves to Done only when its GitHub pull requests are merged, their checks really passed and their tests were not weakened.</Text>

      <Stack space="space.100">
        <Label labelFor="repos">GitHub repositories</Label>
        <TextArea id="repos" value={repos} onChange={(e) => setRepos(e.target.value)} placeholder={"acme/shop\nPAY=acme/payments"} />
        <HelperMessage>One per line. GitHub: owner/name. Bitbucket Cloud: bitbucket:workspace/name. A line on its own is used for every project; KEY=repository sets it for one Jira project.</HelperMessage>
        {problems.filter((p) => !p.startsWith("The label")).map((p, i) => (
          <ErrorMessage key={i}>{p}</ErrorMessage>
        ))}
      </Stack>

      <Stack space="space.100">
        <Label labelFor="skip">Label for work that needs no code</Label>
        <Textfield id="skip" value={skipLabel} onChange={(e) => setSkipLabel(e.target.value)} placeholder="no-code" />
        <HelperMessage>Work items with this label (design, research, a meeting) can move to Done without a pull request. Leave it empty to check every work item.</HelperMessage>
        {problems.filter((p) => p.startsWith("The label")).map((p, i) => (
          <ErrorMessage key={i}>{p}</ErrorMessage>
        ))}
      </Stack>

      <Stack space="space.100">
        <Label labelFor="token">GitHub token (optional)</Label>
        <Textfield id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasToken ? "A token is saved. Type a new one to replace it." : "Paste a read-only token"} />
        <HelperMessage>Needed for private repositories, and recommended for public ones: GitHub allows only 60 requests an hour without one. A fine-grained token with read-only access to the repositories is enough. It is stored encrypted and never shown again.</HelperMessage>
      </Stack>

      <Stack space="space.100">
        <Label labelFor="bbtoken">Bitbucket token (optional)</Label>
        <Textfield id="bbtoken" type="password" value={bbToken} onChange={(e) => setBbToken(e.target.value)} placeholder={hasBbToken ? "A token is saved. Type a new one to replace it." : "email:api-token or username:app-password"} />
        <HelperMessage>Needed for private Bitbucket repositories. Read access to pull requests and repositories is enough. Stored encrypted and never shown again.</HelperMessage>
      </Stack>

      <Inline space="space.100">
        <Button appearance="primary" onClick={() => save(false)} isDisabled={busy}>
          Save
        </Button>
        {hasToken || hasBbToken ? (
          <Button onClick={() => save(true)} isDisabled={busy}>
            Remove saved tokens
          </Button>
        ) : null}
      </Inline>
      {saved ? <SectionMessage appearance="success" title="Saved" /> : null}

      <Setup />

      <SectionMessage appearance="information" title="Linking pull requests">
        <Text>
          Put the work item key in the pull request title or branch name, for example <Code>SHOP-12: round prices</Code>. Work that needs no code can carry the label above.
        </Text>
      </SectionMessage>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Admin />
  </React.StrictMode>,
);
