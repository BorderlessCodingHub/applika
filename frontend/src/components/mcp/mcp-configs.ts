/** The apps the token result writes a configuration for, in the boards' order. */
export const MCP_CLIENTS = [
  "claude_code",
  "claude_desktop",
  "cursor",
  "vscode",
  "codex",
  "gemini",
  "other",
] as const;

export type McpClient = (typeof MCP_CLIENTS)[number];

/** `text` kind: "Other" is an address and a header, not a file. */
export type McpConfigKind = "command" | "json" | "toml" | "text";

/** `narrow`: McpToken.dc.html's line breaks (phone); `wide`: DeskToken.dc.html's. */
export type McpConfigLayout = "wide" | "narrow";

export interface McpConfigOptions {
  layout?: McpConfigLayout;
  /** "Other"'s two labels in the active language (`mcpConfig.address`, `mcpConfig.header`). */
  otherWords?: { address: string; header: string };
}

export interface McpConfig {
  client: McpClient;
  /** The product name; `null` for "Other", whose words are `mcpConfig.other`. */
  label: string | null;
  kind: McpConfigKind;
  /** The message key of the line that says where it goes (`mcpConfig.where.<client>`). */
  where: `mcpConfig.where.${McpClient}`;
  /** Ready to paste, the token filled in. */
  text: string;
}

/** Product names: data, the same in every language. */
export const MCP_CLIENT_LABEL: Readonly<Record<McpClient, string | null>> = {
  claude_code: "Claude Code",
  claude_desktop: "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  other: null,
};

/** The server's name in every config. */
const SERVER = "applika";

/** A JSON (and TOML basic) string literal. */
const q = (value: string): string => JSON.stringify(value);

function claudeCode(url: string, bearer: string, layout: McpConfigLayout) {
  const header = `--header ${q(`Authorization: ${bearer}`)}`;
  return layout === "narrow"
    ? `claude mcp add --transport http \\\n  --scope user ${SERVER} \\\n  ${url} \\\n  ${header}`
    : `claude mcp add --transport http --scope user ${SERVER} ${url} \\\n  ${header}`;
}

function claudeDesktop(url: string, bearer: string, layout: McpConfigLayout) {
  // "Bearer <token>" holds a space, which some clients split args on: it rides in `env`.
  const auth = '"Authorization:${APPLIKA_AUTH}"';
  const args =
    layout === "narrow"
      ? `["-y", "mcp-remote", ${q(url)},\n        "--header", ${auth}]`
      : `["-y", "mcp-remote", ${q(url)}, "--header", ${auth}]`;
  return [
    "{",
    '  "mcpServers": {',
    `    ${q(SERVER)}: {`,
    '      "command": "npx",',
    `      "args": ${args},`,
    `      "env": { "APPLIKA_AUTH": ${q(bearer)} }`,
    "    }",
    "  }",
    "}",
  ].join("\n");
}

/** `"headers"` inline (wide) or one line per key (narrow), as the boards draw it. */
function headers(bearer: string, layout: McpConfigLayout): string[] {
  return layout === "narrow"
    ? ['      "headers": {', `        "Authorization": ${q(bearer)}`, "      }"]
    : [`      "headers": { "Authorization": ${q(bearer)} }`];
}

function jsonServer(
  root: "mcpServers" | "servers",
  fields: string[],
  bearer: string,
  layout: McpConfigLayout,
) {
  return [
    "{",
    `  ${q(root)}: {`,
    `    ${q(SERVER)}: {`,
    ...fields.map((field) => `      ${field},`),
    ...headers(bearer, layout),
    "    }",
    "  }",
    "}",
  ].join("\n");
}

/** "Other": the address and the header, their values in one column. */
function other(
  url: string,
  bearer: string,
  words: { address: string; header: string },
) {
  const width = Math.max(words.address.length, words.header.length) + 2;
  return [
    `${words.address.padEnd(width)}${url}`,
    `${words.header.padEnd(width)}Authorization: ${bearer}`,
  ].join("\n");
}

function codex(url: string, bearer: string) {
  return [
    `[mcp_servers.${SERVER}]`,
    `url = ${q(url)}`,
    `http_headers = { "Authorization" = ${q(bearer)} }`,
  ].join("\n");
}

/**
 * Every client's configuration for `endpoint` with `token` filled in, in
 * the boards' order (DeskToken.dc.html / McpToken.dc.html). Each one goes in
 * the user's own settings, never in a project file.
 */
export function buildMcpConfigs(
  endpoint: string,
  token: string,
  {
    layout = "wide",
    otherWords = { address: "Address", header: "Header" },
  }: McpConfigOptions = {},
): McpConfig[] {
  const bearer = `Bearer ${token}`;
  const text: Record<McpClient, string> = {
    claude_code: claudeCode(endpoint, bearer, layout),
    claude_desktop: claudeDesktop(endpoint, bearer, layout),
    cursor: jsonServer("mcpServers", [`"url": ${q(endpoint)}`], bearer, layout),
    vscode: jsonServer(
      "servers",
      ['"type": "http"', `"url": ${q(endpoint)}`],
      bearer,
      layout,
    ),
    codex: codex(endpoint, bearer),
    gemini: jsonServer(
      "mcpServers",
      [`"httpUrl": ${q(endpoint)}`],
      bearer,
      layout,
    ),
    other: other(endpoint, bearer, otherWords),
  };
  const kind: Record<McpClient, McpConfigKind> = {
    claude_code: "command",
    claude_desktop: "json",
    cursor: "json",
    vscode: "json",
    codex: "toml",
    gemini: "json",
    other: "text",
  };
  return MCP_CLIENTS.map((client) => ({
    client,
    label: MCP_CLIENT_LABEL[client],
    kind: kind[client],
    where: `mcpConfig.where.${client}`,
    text: text[client],
  }));
}
