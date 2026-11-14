import { describe, expect, it } from "vitest";

import {
  MCP_CLIENTS,
  MCP_CLIENT_LABEL,
  buildMcpConfigs,
  type McpClient,
} from "./mcp-configs";

/**
 * PRD 0023 AC2: the ready-to-paste configuration, token filled in, for
 * Claude Code, Claude Desktop (through `npx mcp-remote`), Cursor, VS Code,
 * Codex CLI, Gemini CLI and "Other". Each goes in the user's own settings,
 * never in a project file. The texts are DeskToken.dc.html's (wide) and
 * McpToken.dc.html's (narrow) exactly.
 */

const URL = "https://applika.dev/api/mcp";
const TOKEN = "applika_mcp_fake_00000000000000000000000000000000000000";
const BEARER = `Bearer ${TOKEN}`;

function textOf(client: McpClient, layout: "wide" | "narrow" = "wide") {
  return buildMcpConfigs(URL, TOKEN, { layout }).find(
    (config) => config.client === client,
  )!.text;
}

describe("buildMcpConfigs", () => {
  it("lists the seven clients in the boards' order, each with its kind and where-line key", () => {
    const configs = buildMcpConfigs(URL, TOKEN);

    expect(configs.map((config) => config.client)).toEqual([...MCP_CLIENTS]);
    expect(
      configs.map((config) => [config.label, config.kind, config.where]),
    ).toEqual([
      ["Claude Code", "command", "mcpConfig.where.claude_code"],
      ["Claude Desktop", "json", "mcpConfig.where.claude_desktop"],
      ["Cursor", "json", "mcpConfig.where.cursor"],
      ["VS Code", "json", "mcpConfig.where.vscode"],
      ["Codex CLI", "toml", "mcpConfig.where.codex"],
      ["Gemini CLI", "json", "mcpConfig.where.gemini"],
      [null, "text", "mcpConfig.where.other"],
    ]);
    expect(MCP_CLIENT_LABEL.other).toBeNull();
  });

  it("fills the address and the token into every configuration", () => {
    for (const layout of ["wide", "narrow"] as const) {
      for (const config of buildMcpConfigs(URL, TOKEN, { layout })) {
        expect(config.text, `${config.client} ${layout}`).toContain(URL);
        expect(config.text, `${config.client} ${layout}`).toContain(BEARER);
      }
    }
  });

  it("Claude Code: one command, user scope (never a project's .mcp.json)", () => {
    expect(textOf("claude_code")).toBe(
      `claude mcp add --transport http --scope user applika ${URL} \\\n  --header "Authorization: ${BEARER}"`,
    );
    expect(textOf("claude_code", "narrow")).toBe(
      `claude mcp add --transport http \\\n  --scope user applika \\\n  ${URL} \\\n  --header "Authorization: ${BEARER}"`,
    );
    expect(textOf("claude_code")).not.toMatch(/--scope (project|local)/);
  });

  it("Claude Desktop: npx mcp-remote, the bearer in env (no space in an arg)", () => {
    const text = textOf("claude_desktop");
    expect(text).toBe(
      [
        "{",
        '  "mcpServers": {',
        '    "applika": {',
        '      "command": "npx",',
        `      "args": ["-y", "mcp-remote", "${URL}", "--header", "Authorization:\${APPLIKA_AUTH}"],`,
        `      "env": { "APPLIKA_AUTH": "${BEARER}" }`,
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
    const parsed = JSON.parse(text);
    expect(parsed.mcpServers.applika.args).toEqual([
      "-y",
      "mcp-remote",
      URL,
      "--header",
      "Authorization:${APPLIKA_AUTH}",
    ]);
    expect(parsed.mcpServers.applika.env).toEqual({ APPLIKA_AUTH: BEARER });
    expect(JSON.parse(textOf("claude_desktop", "narrow"))).toEqual(parsed);
    expect(textOf("claude_desktop", "narrow")).toContain(
      `"args": ["-y", "mcp-remote", "${URL}",\n        "--header", "Authorization:\${APPLIKA_AUTH}"],`,
    );
  });

  it("Cursor: mcpServers with url and headers, valid JSON at both widths", () => {
    const wide = textOf("cursor");
    expect(wide).toContain(`      "headers": { "Authorization": "${BEARER}" }`);
    expect(textOf("cursor", "narrow")).toContain(
      `      "headers": {\n        "Authorization": "${BEARER}"\n      }`,
    );
    for (const text of [wide, textOf("cursor", "narrow")]) {
      expect(JSON.parse(text)).toEqual({
        mcpServers: {
          applika: { url: URL, headers: { Authorization: BEARER } },
        },
      });
    }
  });

  it("VS Code: servers with type http", () => {
    expect(JSON.parse(textOf("vscode"))).toEqual({
      servers: {
        applika: {
          type: "http",
          url: URL,
          headers: { Authorization: BEARER },
        },
      },
    });
    expect(JSON.parse(textOf("vscode", "narrow"))).toEqual(
      JSON.parse(textOf("vscode")),
    );
  });

  it("Codex CLI: [mcp_servers.applika] with url and http_headers, the token filled in", () => {
    const text = textOf("codex");
    expect(text).toBe(
      `[mcp_servers.applika]\nurl = "${URL}"\nhttp_headers = { "Authorization" = "${BEARER}" }`,
    );
    expect(textOf("codex", "narrow")).toBe(text);
    // Not bearer_token_env_var: the configuration is complete as pasted.
    expect(text).not.toContain("bearer_token_env_var");
  });

  it("Gemini CLI: mcpServers with httpUrl", () => {
    expect(JSON.parse(textOf("gemini"))).toEqual({
      mcpServers: {
        applika: { httpUrl: URL, headers: { Authorization: BEARER } },
      },
    });
    expect(JSON.parse(textOf("gemini", "narrow"))).toEqual(
      JSON.parse(textOf("gemini")),
    );
  });

  it("Other: the address and the header, values in one column, in the given words", () => {
    expect(textOf("other")).toBe(
      `Address  ${URL}\nHeader   Authorization: ${BEARER}`,
    );
    const portuguese = buildMcpConfigs(URL, TOKEN, {
      otherWords: { address: "Endereço", header: "Cabeçalho" },
    }).find((config) => config.client === "other")!;
    expect(portuguese.text).toBe(
      `Endereço   ${URL}\nCabeçalho  Authorization: ${BEARER}`,
    );
  });

  it("escapes what JSON and TOML would otherwise break on", () => {
    const odd = 'https://example.test/api/mcp?x="1"';
    for (const client of ["cursor", "vscode", "gemini"] as const) {
      const text = buildMcpConfigs(odd, TOKEN).find(
        (config) => config.client === client,
      )!.text;
      expect(JSON.stringify(JSON.parse(text))).toContain(
        JSON.stringify(odd).slice(1, -1),
      );
    }
    expect(
      buildMcpConfigs(odd, TOKEN).find((config) => config.client === "codex")!
        .text,
    ).toContain('url = "https://example.test/api/mcp?x=\\"1\\""');
  });

  it("names no project file anywhere: user settings only", () => {
    for (const config of buildMcpConfigs(URL, TOKEN)) {
      expect(config.text).not.toMatch(/\.mcp\.json|\.vscode\/|\.cursor\/mcp/);
    }
  });
});
