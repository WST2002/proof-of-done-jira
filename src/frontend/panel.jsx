// Work item panel: the same check the Done transition runs, shown before anyone tries to move the work item.
import React, { useEffect, useState } from "react";
import ForgeReconciler, { Box, Button, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Text } from "@forge/react";
import { invoke } from "@forge/bridge";

const CHECK_STATE = (c) => (c.conclusion === "success" ? "success" : c.status !== "completed" ? "inprogress" : c.conclusion === "skipped" || c.conclusion === "neutral" ? "default" : "removed");

function Panel() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);

  const run = async () => {
    setBusy(true);
    setResult(await invoke("check"));
    setBusy(false);
  };
  useEffect(() => {
    run();
  }, []);

  if (busy && !result) return <Spinner label="Checking the linked pull requests" />;

  return (
    <Stack space="space.150">
      <SectionMessage appearance={result.done ? "success" : "warning"} title={result.skipped ? "No code needed" : result.done ? "Ready for Done" : "Not done yet"}>
        {result.done ? (
          <Text>{result.skipped ? result.message : "Every linked pull request is merged, its checks passed and its tests were kept honest."}</Text>
        ) : (
          <Stack space="space.050">
            {(result.problems?.length ? result.problems.map((p) => p.text) : [result.message]).map((t, i) => (
              <Text key={i}>• {t}</Text>
            ))}
          </Stack>
        )}
      </SectionMessage>
      {result.prs?.map((pr) => (
        <Box key={pr.number} padding="space.100" backgroundColor="color.background.neutral.subtle">
          <Stack space="space.075">
            <Inline space="space.100" alignBlock="center">
              <Link href={pr.url} openNewTab>
                PR #{pr.number}
              </Link>
              <Lozenge appearance={pr.merged ? "success" : "moved"}>{pr.merged ? "merged" : "not merged"}</Lozenge>
              <Text>{pr.files === 1 ? "1 file" : `${pr.files} files`}</Text>
            </Inline>
            <Inline space="space.075" shouldWrap>
              {pr.checks.length ? pr.checks.map((c, i) => <Lozenge key={i} appearance={CHECK_STATE(c)}>{`${c.name}: ${c.conclusion ?? c.status}`}</Lozenge>) : <Lozenge appearance="removed">no CI checks</Lozenge>}
            </Inline>
          </Stack>
        </Box>
      ))}
      <Inline space="space.100" alignBlock="center">
        <Button onClick={run} isDisabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </Button>
        {result.repo ? (
          <Text>
            Repository: <Strong>{result.repo}</Strong>
          </Text>
        ) : null}
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
