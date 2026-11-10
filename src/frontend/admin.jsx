// Admin page: which GitHub repository each Jira project uses, and an optional read-only token.
import React, { useEffect, useState } from "react";
import ForgeReconciler, { Button, Code, ErrorMessage, HelperMessage, Inline, Label, List, ListItem, SectionMessage, Spinner, Stack, Text, TextArea, Textfield } from "@forge/react";
import { invoke } from "@forge/bridge";

function Admin() {
  const [repos, setRepos] = useState(null);
  const [token, setToken] = useState("");
  const [skipLabel, setSkipLabel] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [problems, setProblems] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke("getSettings").then((s) => {
      setRepos(s.repos);
      setSkipLabel(s.skipLabel);
      setHasToken(s.hasToken);
    });
  }, []);

  const save = async (clearToken = false) => {
    setBusy(true);
    setSaved(false);
    const r = await invoke("saveSettings", { repos, token, clearToken, skipLabel });
    setProblems(r.problems);
    if (r.ok) {
      setSaved(true);
      setToken("");
      setHasToken(r.hasToken);
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
        <HelperMessage>One per line. A line like owner/name is used for every project; KEY=owner/name sets the repository for one Jira project.</HelperMessage>
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

      <Inline space="space.100">
        <Button appearance="primary" onClick={() => save(false)} isDisabled={busy}>
          Save
        </Button>
        {hasToken ? (
          <Button onClick={() => save(true)} isDisabled={busy}>
            Remove saved token
          </Button>
        ) : null}
      </Inline>
      {saved ? <SectionMessage appearance="success" title="Saved" /> : null}

      <SectionMessage appearance="information" title="Turn it on for a workflow">
        <List type="ordered">
          <ListItem>
            <Text>Open the project's workflow and select the transition into Done.</Text>
          </ListItem>
          <ListItem>
            <Text>Add a validator and choose Proof of Done.</Text>
          </ListItem>
          <ListItem>
            <Text>
              Link pull requests by putting the work item key in the PR title or branch name, for example <Code>SHOP-12: round prices</Code>.
            </Text>
          </ListItem>
        </List>
      </SectionMessage>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Admin />
  </React.StrictMode>,
);
