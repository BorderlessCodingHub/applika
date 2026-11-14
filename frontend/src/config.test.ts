import { afterEach, describe, expect, it, vi } from "vitest";

/** P3: the MCP server address the tab, the configs and /mcp print comes from the API base URL. */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function config() {
  vi.resetModules();
  return (await import("./config")).APP_CONFIG;
}

describe("APP_CONFIG.mcp", () => {
  it("points the page to /mcp and the server to <apiBaseURL>/mcp", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://applika.dev/api");

    const app = await config();
    expect(app.mcp).toEqual({
      page: "/mcp",
      endpoint: "https://applika.dev/api/mcp",
    });
  });

  it("trims a trailing slash of the API base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000/api//");

    expect((await config()).mcp.endpoint).toBe("http://localhost:8000/api/mcp");
  });

  it("has no applika-cli link left", async () => {
    expect(Object.keys(await config())).not.toContain("cli");
  });
});
