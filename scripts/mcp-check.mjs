// Connects to the Proof of Done MCP server like any external client (OAuth 2.1 with PKCE), lists the tools and calls each one.
// Usage: npm run mcp-check -- POD-13 POD-6 POD-32   (open the printed link, pick your site, press Accept)
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

const URL_ = new URL("https://mcp.atlassian.com/forge/487a9b05-d2bc-4e8f-98ce-2c533e95676f");
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const state = {};

const provider = {
  get redirectUrl() { return REDIRECT; },
  get clientMetadata() { return { client_name: "Proof of Done MCP test", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }; },
  clientInformation: () => state.client,
  saveClientInformation: (c) => { state.client = c; },
  tokens: () => state.tokens,
  saveTokens: (t) => { state.tokens = t; },
  redirectToAuthorization: (u) => { console.log(`Open this link, choose your site and press Accept:\n${u}\n`); },
  saveCodeVerifier: (v) => { state.verifier = v; },
  codeVerifier: () => state.verifier,
};

const waitForCode = () => new Promise((resolve, reject) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, REDIRECT);
    if (u.pathname !== "/callback") { res.end(); return; }
    res.end("Proof of Done MCP test: you can close this tab.");
    srv.close();
    u.searchParams.get("code") ? resolve(u.searchParams.get("code")) : reject(new Error(`no code: ${u.search}`));
  }).listen(PORT);
  setTimeout(() => { srv.close(); reject(new Error("timed out waiting for consent")); }, 300000);
});

const connect = async () => {
  const client = new Client({ name: "proof-of-done-mcp-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(URL_, { authProvider: provider });
  try {
    await client.connect(transport);
    return client;
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
    const code = await waitForCode();
    await transport.finishAuth(code);
    const c2 = new Client({ name: "proof-of-done-mcp-test", version: "1.0.0" });
    await c2.connect(new StreamableHTTPClientTransport(URL_, { authProvider: provider }));
    return c2;
  }
};

const client = await connect();
const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => `${t.name}(${Object.keys(t.inputSchema?.properties ?? {}).join(",")})`).join(" | "));
const keyArg = (t) => Object.keys(t.inputSchema?.properties ?? {})[0] ?? "issueKey";
const keys = process.argv.slice(2);
for (const key of keys.length ? keys : ["POD-13"]) {
  for (const t of tools) {
    const r = await client.callTool({ name: t.name, arguments: { [keyArg(t)]: key } });
    console.log(`\n== ${t.name} ${key}${r.isError ? " (error)" : ""}\n${r.content.map((c) => c.text ?? "").join("\n")}`);
  }
}
await client.close();
process.exit(0);
