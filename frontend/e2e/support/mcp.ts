import type { APIRequestContext, APIResponse } from "@playwright/test";

import { apiUrl } from "./auth";

/**
 * The hosted MCP server's JSON-RPC door (`POST <api>/mcp`, ADR-0028), called
 * exactly as an AI app calls it. Specs that hold a token never compare
 * against it (a failure message would print it), switch trace, screenshot
 * and video off, and set `PLAYWRIGHT_NO_COPY_PROMPT` so no failure page
 * snapshot keeps one (`e2e/mcp.spec.ts`, `e2e/devices.spec.ts`).
 */

/** The answer to a revoked, expired or unknown token: 401 AUTH-1051. */
export const MCP_TOKEN_REFUSED = {
  detail:
    "MCP token invalid, revoked or expired. Create a new one in Applika: Profile > MCP.",
  code: "AUTH-1051",
} as const;

let rpcId = 0;

/** One JSON-RPC call to the hosted MCP server, as an AI app sends it. */
export async function mcpCall(
  request: APIRequestContext,
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<APIResponse> {
  rpcId += 1;
  try {
    return await request.post(apiUrl("/mcp"), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      data: {
        jsonrpc: "2.0",
        id: rpcId,
        method,
        ...(params ? { params } : {}),
      },
    });
  } catch {
    // Playwright's call log lists the request's headers, the bearer among
    // them: a call that gets no answer fails with these words only.
    throw new Error(`POST /mcp ${method} got no answer`);
  }
}
