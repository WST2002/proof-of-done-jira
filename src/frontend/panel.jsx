// Work item panel: the same check the Done transition runs, shown before anyone tries to move the work item.
import React, { useEffect, useState } from "react";
import ForgeReconciler, { Box, Button, Code, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Text, useProductContext } from "@forge/react";
import { invoke } from "@forge/bridge";

const CHECK_STATE = (c) => (c.conclusion === "success" ? "success" : c.status !== "completed" ? "inprogress" : c.conclusion === "skipped" || c.conclusion === "neutral" ? "default" : "removed");
const at = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "");

// What the work item needs, in the words a person would use.
function headline(result, key) {
  if (result.skipped) return { appearance: "success", title: "No code needed", body: result.message };
  if (result.done) return { appearance: "success", title: "Ready for Done", body: "Every linked pull request is merged, its checks passed and its tests were kept honest." };
  if (result.problems?.some((p) => p.kind === "no-pr")) return { appearance: "information", title: "No pull request yet", body: `Put ${key} in a pull request title or branch name, for example "${key}: fix the cart total". Work with no code can carry the label no-code.` };
  if (!result.repo) return { appearance: "information", title: "Not set up yet", body: result.message };
  if (result.problems?.some((p) => p.kind === "tampering")) return { appearance: "error", title: "Blocked: the tests were changed to pass", body: "CI may be green, but these changes make the tests prove less than before." };
  return { appearance: "warning", title: "Not done yet", body: null };
}

function Evidence({ items }) {
  return (
    <Stack space="space.100">
      {items.map((e, i) => (
        <Box key={i} padding="space.100" backgroundColor="color.background.danger.subtle">
          <Stack space="space.050">
            <Text>
              <Strong>{`${e.file}${e.line ? `:${e.line}` : ""}`}</Strong> {e.says}
            </Text>
            {e.before ? (
              <Text>
                Before: <Code>{e.before}</Code>
              </Text>
            ) : null}
            {e.after ? (
              <Text>
                {e.before ? "After: " : ""}
                <Code>{e.after}</Code>
              </Text>
            ) : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

const CI = { passed: ["success", "CI passed"], failed: ["removed", "CI failed"], running: ["inprogress", "CI running"], none: ["default", "no CI"] };

function Timeline({ number }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(false);
  const load = async () => {
    setOpen(true);
    if (!t) setT(await invoke("timeline", { number }));
  };
  if (!open) return <Button appearance="subtle" onClick={load}>Show test timeline</Button>;
  if (!t) return <Spinner label="Reading each commit" />;
  if (!t.ok) return <Text>{t.message}</Text>;
  return (
    <Stack space="space.075">
      <Strong>Test timeline</Strong>
      {t.entries.map((e) => (
        <Stack key={e.sha} space="space.050">
          <Inline space="space.075" alignBlock="center" shouldWrap>
            <Code>{e.short}</Code>
            <Text>{e.title}</Text>
            <Lozenge appearance={CI[e.ci][0]}>{CI[e.ci][1]}</Lozenge>
            {e.findings.length ? <Lozenge appearance="removed">{e.findings.map((f) => f.says).join(", ")}</Lozenge> : <Lozenge appearance="success">tests kept</Lozenge>}
          </Inline>
          {e.note ? <SectionMessage appearance="warning" title={e.note} /> : null}
        </Stack>
      ))}
    </Stack>
  );
}

function Panel() {
  const context = useProductContext();
  const key = context?.extension?.issue?.key ?? "this work item";
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

  const head = headline(result, key);
  const tampering = result.problems?.find((p) => p.kind === "tampering");
  const others = (result.problems ?? []).filter((p) => p.kind !== "tampering" && p.kind !== "no-pr");

  return (
    <Stack space="space.150">
      <SectionMessage appearance={head.appearance} title={head.title}>
        {head.body ? <Text>{head.body}</Text> : null}
        {others.length ? (
          <Stack space="space.050">
            {others.map((p, i) => (
              <Text key={i}>• {p.text}</Text>
            ))}
          </Stack>
        ) : null}
      </SectionMessage>

      {tampering?.evidence?.length ? <Evidence items={tampering.evidence} /> : null}

      {result.warnings?.length ? (
        <SectionMessage appearance="information" title="Heads-up (not blocking)">
          <Stack space="space.050">
            {result.warnings.map((w, i) => (
              <Text key={i}>• {w.text}</Text>
            ))}
          </Stack>
        </SectionMessage>
      ) : null}

      {result.prs?.map((pr) => (
        <Box key={pr.number} padding="space.100" backgroundColor="color.background.neutral.subtle">
          <Stack space="space.075">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Link href={pr.url} openNewTab>
                PR #{pr.number}
              </Link>
              <Lozenge appearance={pr.merged ? "success" : "moved"}>{pr.merged ? "merged" : "not merged"}</Lozenge>
              <Text>{pr.files === 1 ? "1 file" : `${pr.files} files`}</Text>
              {pr.ai ? <Lozenge appearance="new">{`commits credit ${pr.ai}`}</Lozenge> : null}
            </Inline>
            <Timeline number={pr.number} />
            <Inline space="space.075" shouldWrap>
              {pr.checks.length ? pr.checks.map((c, i) => <Lozenge key={i} appearance={CHECK_STATE(c)}>{`${c.name}: ${c.conclusion ?? c.status}`}</Lozenge>) : <Lozenge appearance="removed">no CI checks</Lozenge>}
            </Inline>
          </Stack>
        </Box>
      ))}

      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Button appearance="primary" onClick={run} isDisabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </Button>
        <Text>
          {result.checkedAt ? `Checked ${at(result.checkedAt)}` : ""}
          {result.prs?.[0]?.sha ? ` at commit ${result.prs[0].sha.slice(0, 7)}` : ""}
          {result.repo ? ` · ${result.repo}` : ""}
        </Text>
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
