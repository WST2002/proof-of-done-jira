// Project page: one place for a team lead to see what Proof of Done blocked, which test shortcuts it caught,
// and who overrode a block and why. It reads the result each check saved on the work item.
import React, { useEffect, useState } from "react";
import ForgeReconciler, { xcss, Box, Button, DonutChart, DynamicTable, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Text, User } from "@forge/react";
import { invoke } from "@forge/bridge";

const at = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const keyLink = (key) => <Link href={`/browse/${key}`}>{key}</Link>;

// A white card in Jira's own style: the number, what it counts, and a small status lozenge for its meaning.
function Tile({ value, label, tag, appearance }) {
  return (
    <Box padding="space.200" backgroundColor="elevation.surface.raised" xcss={CARD}>
      <Stack space="space.075">
        <Inline>
          <Lozenge appearance={appearance}>{tag}</Lozenge>
        </Inline>
        <Heading size="xlarge">{String(value)}</Heading>
        <Text color="color.text.subtle">{label}</Text>
      </Stack>
    </Box>
  );
}

const CARD = xcss({ borderRadius: "border.radius.200", boxShadow: "elevation.shadow.raised", minWidth: "size.1000" });
const PANEL = xcss({ borderRadius: "border.radius.200", boxShadow: "elevation.shadow.raised" });
const head = (...cells) => ({ cells: cells.map(([key, content]) => ({ key, content })) });
// Jira's own status colours: green ready, red blocked, blue override, grey no code.
const COLORS = { ready: "#1F845A", blocked: "#C9372C", overridden: "#0C66E4", noCode: "#8590A2" };

function Dashboard() {
  const [d, setD] = useState(null);
  const load = async () => {
    setD(null);
    try {
      setD(await invoke("dashboard"));
    } catch (e) {
      setD({ ok: false, message: `The dashboard did not load (${e.message}).` });
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (!d) return <Spinner label="Reading the checks of this project" />;
  if (!d.ok) return <SectionMessage appearance="error" title="Could not show the dashboard"><Text>{d.message}</Text></SectionMessage>;
  const c = d.counts;

  const split = [
    { result: "Ready for Done", count: c.ready, color: COLORS.ready },
    { result: "Blocked now", count: c.blocked, color: COLORS.blocked },
    { result: "Done by override", count: c.overridden, color: COLORS.overridden },
    { result: "No code needed", count: c.noCode, color: COLORS.noCode },
  ].filter((r) => r.count);
  const latest = d.caught.flatMap((x) => x.caught.map((e) => ({ ...e, key: x.key }))).slice(0, 5);

  return (
    <Stack space="space.300">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text color="color.text.subtle">{`Every work item Proof of Done checked in ${d.project}. Pull requests from`}</Text>
        {d.repo ? <Lozenge>{d.repo}</Lozenge> : <Lozenge appearance="moved">no repository set</Lozenge>}
      </Inline>

      <Inline space="space.200" shouldWrap>
        <Tile value={c.checked} label="work items checked" tag="Checked" appearance="default" />
        <Tile value={c.ready} label="ready for Done" tag="Ready" appearance="success" />
        <Tile value={c.blocked} label="blocked now" tag="Blocked" appearance="removed" />
        <Tile value={c.caught} label="tests changed to pass" tag="Caught" appearance="moved" />
        <Tile value={c.overridden} label="let through with a reason" tag="Override" appearance="inprogress" />
      </Inline>

      <Inline space="space.200" shouldWrap alignBlock="stretch">
        {split.length ? (
          <Box padding="space.200" backgroundColor="elevation.surface.raised" xcss={PANEL}>
            <DonutChart data={split} colorAccessor="result" valueAccessor="count" labelAccessor="result" title="Results of the last checks" width={420} height={300} showMarkLabels showBorder={false} hideMenu colorPalette={split.map((r) => ({ key: r.result, value: r.color }))} />
          </Box>
        ) : null}
        <Box padding="space.200" backgroundColor="elevation.surface.raised" xcss={PANEL}>
          <Stack space="space.150">
            <Heading size="small">Latest catches</Heading>
            {latest.length ? (
              latest.map((e, i) => (
                <Stack key={i} space="space.025">
                  <Inline space="space.075" alignBlock="center">
                    {keyLink(e.key)}
                    <Lozenge appearance="moved">{`PR #${e.pr}`}</Lozenge>
                  </Inline>
                  <Text><Strong>{`${e.file}${e.line ? `:${e.line}` : ""}`}</Strong>{` ${e.says}`}</Text>
                </Stack>
              ))
            ) : (
              <Text color="color.text.subtle">No test was weakened, skipped or deleted to get a green build.</Text>
            )}
          </Stack>
        </Box>
      </Inline>

      <Stack space="space.100">
        <Heading size="medium">Blocked now</Heading>
        <DynamicTable
          head={head(["key", "Work item"], ["summary", "Summary"], ["status", "Status"], ["why", "Why it is blocked"])}
          rows={d.blocked.map((b) => ({ key: b.key, cells: [{ key: "key", content: keyLink(b.key) }, { key: "summary", content: b.summary }, { key: "status", content: <Lozenge>{b.status}</Lozenge> }, { key: "why", content: b.blocker || "Open the work item and press Check again to see why." }] }))}
          emptyView="Nothing is blocked. Every checked work item is ready for Done, or was let through with a reason."
          rowsPerPage={10}
        />
      </Stack>

      <Stack space="space.100">
        <Heading size="medium">Tests changed to pass, caught</Heading>
        <DynamicTable
          head={head(["key", "Work item"], ["what", "What was changed"])}
          rows={d.caught.map((x) => ({
            key: x.key,
            cells: [
              { key: "key", content: keyLink(x.key) },
              { key: "what", content: <Stack space="space.050">{x.caught.map((e, i) => <Text key={i}><Strong>{`${e.file}${e.line ? `:${e.line}` : ""}`}</Strong>{` ${e.says} (PR #${e.pr})`}</Text>)}</Stack> },
            ],
          }))}
          emptyView="No test was weakened, skipped or deleted to get a green build."
          rowsPerPage={10}
        />
      </Stack>

      <Stack space="space.100">
        <Heading size="medium">Done by override</Heading>
        <DynamicTable
          head={head(["key", "Work item"], ["who", "Who"], ["reason", "Reason"], ["when", "When"])}
          rows={d.overrides.map((o) => ({ key: o.key, cells: [{ key: "key", content: keyLink(o.key) }, { key: "who", content: o.accountId ? <User accountId={o.accountId} /> : "" }, { key: "reason", content: o.reason }, { key: "when", content: at(o.at) }] }))}
          emptyView="No block was overridden."
          rowsPerPage={10}
        />
      </Stack>

      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Button onClick={load}>Refresh</Button>
        <Text color="color.text.subtle">
          {`Latest ${d.shown} work items.`}
          {c.unchecked ? ` ${c.unchecked} not checked yet: a work item is checked when its Proof of Done panel opens or when it moves to Done.` : ""}
        </Text>
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
