import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileMcp } from "@/app/(protected)/profile/profile-page";
import { APP_CONFIG } from "@/config";
import { services } from "@/services/services";
import type { McpTokenCreated, UserSession } from "@/services/types/sessions";
import { renderInPortuguese } from "@/test/portuguese";

import { McpTab, mcpTabState, type McpTabProps } from "./mcp-tab";

/**
 * PRD 0023 (AC1-4, 9, 11-13): Profile › MCP at md and up. The presentational
 * `McpTab` is driven through its states (loading, error, ready, empty), the
 * create dialog (name, scope, then the token once and the configurations)
 * and Revoke; the last block wires it to the real `use-sessions` hooks
 * (services mocked).
 */

vi.mock("@/services/services", () => ({
  services: {
    sessions: {
      list: vi.fn(),
      revoke: vi.fn(),
      revokeOthers: vi.fn(),
      createMcpToken: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ENDPOINT = "https://applika.dev/api/mcp";
const TOKEN = "applika_mcp_fake_00000000000000000000000000000000000000";
// Saturday 14 November 2026, 12:00 UTC.
const NOW = new Date("2026-11-14T12:00:00Z");

function session(
  id: string,
  overrides: Partial<UserSession> = {},
): UserSession {
  return {
    id,
    client_type: "mcp",
    sign_in_method: "mcp_token",
    device_name: `Token ${id}`,
    client_label: "Unknown device",
    created_ip: "188.81.24.6",
    last_ip: "188.81.24.6",
    created_at: "2026-11-14T09:00:00Z",
    last_used_at: "2026-11-14T11:58:00Z",
    expires_at: "2027-02-12T11:58:00Z",
    ended_at: null,
    status: "active",
    current: false,
    scope: ["read", "write"],
    ...overrides,
  };
}

const CLAUDE = session("m1", {
  device_name: "Claude Code on my laptop",
  scope: ["read", "write"],
});
const CURSOR = session("m2", {
  device_name: "Cursor",
  scope: ["read"],
  last_ip: null,
  last_used_at: null,
  created_at: "2026-11-10T09:00:00Z",
  expires_at: "2027-02-08T09:00:00Z",
});
const GEMINI = session("m3", {
  device_name: "Gemini CLI",
  scope: ["read", "write", "delete"],
});
const WEB = session("w1", {
  client_type: "web",
  sign_in_method: "borderless",
  device_name: "Chrome on macOS",
  client_label: "Chrome 141 on macOS",
  scope: null,
  current: true,
});
const CLI = session("c1", {
  client_type: "cli",
  sign_in_method: "cli_device",
  device_name: "e2e-laptop",
  scope: null,
});
const REVOKED = session("m4", {
  device_name: "Old token",
  status: "revoked",
  ended_at: "2026-11-12T10:00:00Z",
});

const CREATED: McpTokenCreated = {
  id: "m9",
  name: "Claude Code",
  scope: ["read"],
  token: TOKEN,
  created_at: "2026-11-14T12:00:00Z",
  expires_at: "2027-02-12T12:00:00Z",
};

function renderTab(props: Partial<McpTabProps> = {}) {
  const handlers = {
    onRetry: vi.fn(),
    onCreate: vi.fn(),
    onCloseResult: vi.fn(),
    onRevoke: vi.fn(),
  };
  const all: McpTabProps = {
    sessions: [WEB, CLAUDE, CLI, CURSOR, REVOKED, GEMINI],
    endpoint: ENDPOINT,
    now: NOW,
    ...handlers,
    ...props,
  };
  const view = render(<McpTab {...all} />);
  const rerender = (next: Partial<McpTabProps>) =>
    view.rerender(<McpTab {...all} {...next} />);
  return { ...view, ...handlers, rerender, props: all };
}

const tab = () => document.querySelector<HTMLElement>('[data-slot="mcp-tab"]')!;
const row = (id: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="mcp-row"][data-session-id="${id}"]`,
  )!;

/** After `userEvent.setup()`, which puts its own clipboard in place. */
function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

describe("mcpTabState", () => {
  it("is ready with a list, error without one, loading until settled", () => {
    expect(mcpTabState({ sessions: [], isError: true })).toBe("ready");
    expect(mcpTabState({ sessions: undefined, isError: true })).toBe("error");
    expect(mcpTabState({ sessions: undefined, isLoading: true })).toBe(
      "loading",
    );
    expect(mcpTabState({ sessions: undefined, isLoading: false })).toBe(
      "ready",
    );
  });
});

describe("McpTab states", () => {
  it("loading: a status that says so, the address and New token stay", () => {
    renderTab({ sessions: undefined, isLoading: true });

    expect(tab()).toHaveAttribute("data-state", "loading");
    expect(
      screen.getAllByRole("status").map((status) => status.textContent),
    ).toContain("Loading MCP connections");
    expect(screen.getByRole("button", { name: "New token" })).toBeVisible();
    expect(screen.getByText(ENDPOINT)).toBeInTheDocument();
  });

  it("error: an alert with Try again; retrying is aria-busy", async () => {
    const user = userEvent.setup();
    const { onRetry, rerender } = renderTab({
      sessions: undefined,
      isError: true,
    });

    expect(tab()).toHaveAttribute("data-state", "error");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load your MCP connections");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender({ sessions: undefined, isError: true, isRetrying: true });
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("aria-busy", "true");
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();

    // A successful retry hands focus to "Active".
    rerender({ sessions: [CLAUDE], isError: false, isRetrying: false });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 3, name: "Active" }),
      ).toHaveFocus(),
    );
  });

  it("ready: the active MCP connections only, in the server's order", () => {
    renderTab();

    expect(tab()).toHaveAttribute("data-state", "ready");
    const rows = document.querySelectorAll('[data-slot="mcp-row"]');
    expect(
      [...rows].map((node) => node.getAttribute("data-session-id")),
    ).toEqual(["m1", "m2", "m3"]);
    expect(screen.queryByText("Chrome on macOS")).toBeNull();
    expect(screen.queryByText("e2e-laptop")).toBeNull();
    expect(screen.queryByText("Old token")).toBeNull();
  });

  it("ready: each row's name, scope, created, last use, last IP and the date it ends if unused", () => {
    renderTab();
    const claude = within(row("m1"));

    expect(claude.getByText("Claude Code on my laptop")).toBeInTheDocument();
    expect(
      row("m1").querySelector('[data-slot="mcp-scope"]'),
    ).toHaveTextContent("Read and write");
    expect(claude.getAllByRole("term").map((term) => term.textContent)).toEqual(
      ["Created", "Last used", "IP address", "Ends if unused"],
    );
    expect(claude.getByText("Nov 14, 2026")).toHaveAttribute(
      "dateTime",
      CLAUDE.created_at,
    );
    expect(claude.getByText("2 minutes ago")).toHaveAttribute(
      "dateTime",
      CLAUDE.last_used_at,
    );
    expect(claude.getByText("188.81.24.6")).toBeInTheDocument();
    expect(claude.getByText("Feb 12, 2027")).toHaveAttribute(
      "dateTime",
      CLAUDE.expires_at,
    );

    const cursor = within(row("m2"));
    expect(
      row("m2").querySelector('[data-slot="mcp-scope"]'),
    ).toHaveTextContent("Read only");
    expect(cursor.getByText("Never")).toBeInTheDocument();
    expect(cursor.getByText("Not recorded")).toBeInTheDocument();
    expect(
      row("m3").querySelector('[data-slot="mcp-scope"]'),
    ).toHaveTextContent("Full access");
    // A scope never changes: no edit control on a row.
    expect(claude.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Revoke",
    ]);
  });

  it("says how a token ends and how to widen one, and links to /mcp", () => {
    renderTab();

    expect(
      screen.getByText(/A token ends 90 days after its last use\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Need more access? Create a new token with a wider scope and revoke the old one; a scope never changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How MCP works" })).toHaveAttribute(
      "href",
      "/mcp",
    );
  });

  it("empty: the empty state, whose Create token opens the dialog", async () => {
    const user = userEvent.setup();
    renderTab({ sessions: [WEB, CLI, REVOKED] });

    expect(tab()).toHaveAttribute("data-state", "ready");
    const empty = document.querySelector<HTMLElement>(
      '[data-slot="mcp-empty"]',
    )!;
    expect(empty).toHaveTextContent("No MCP connections yet");
    expect(empty).toHaveTextContent(
      "Create a token, copy the configuration for your app, paste it and restart the app.",
    );
    await user.click(
      within(empty).getByRole("button", { name: "Create token" }),
    );
    expect(
      screen.getByRole("dialog", { name: "New MCP token" }),
    ).toBeInTheDocument();
  });

  it("copies the server address", async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    renderTab();

    await user.click(
      screen.getByRole("button", { name: "Copy the server address" }),
    );
    expect(writeText).toHaveBeenCalledWith(ENDPOINT);
    expect(
      screen.getByRole("button", { name: "Server address copied" }),
    ).toBeInTheDocument();
  });
});

describe("McpTab create dialog", () => {
  it("names it, picks Read and write by default, and sends both", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", { name: "New MCP token" });
    expect(dialog).toHaveAttribute("data-step", "create");
    expect(dialog).toHaveAccessibleDescription(
      "Your AI app sends it with every call to act as you.",
    );
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("MCP connection");
    expect(name).toHaveAttribute("maxLength", "100");
    expect(name).toHaveAccessibleDescription(
      "Shown in Devices and in the MCP tab. 14/100",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Read and write" }),
    ).toBeChecked();
    expect(dialog).toHaveTextContent(
      "The scope can't change later. For more access, create a new token.",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Create token" }),
    );
    expect(onCreate).toHaveBeenCalledWith("MCP connection", ["read", "write"]);
  });

  it("sends the typed name and the chosen scope; Enter submits; the counter follows", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    const dialog = screen.getByRole("dialog", { name: "New MCP token" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Cursor");
    expect(within(dialog).getByText("6/100")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Read only" }));
    await user.type(name, "{Enter}");

    expect(onCreate).toHaveBeenCalledWith("Cursor", ["read"]);
  });

  it("Full access sends read write delete", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    await user.click(screen.getByRole("radio", { name: "Full access" }));
    await user.click(screen.getByRole("button", { name: "Create token" }));

    expect(onCreate).toHaveBeenCalledWith("MCP connection", [
      "read",
      "write",
      "delete",
    ]);
  });

  it("caps the name at 100 characters", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "x".repeat(120));

    expect(name).toHaveValue("x".repeat(100));
    expect(screen.getByText("100/100")).toBeInTheDocument();
  });

  it("while creating: Create is aria-busy, a second press and Escape do nothing", async () => {
    const user = userEvent.setup();
    const { onCreate, onCloseResult, rerender } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    rerender({ isCreating: true });
    const create = screen.getByRole("button", { name: "Create token" });
    expect(create).toHaveAttribute("aria-busy", "true");
    expect(create).toHaveAttribute("aria-disabled", "true");
    await user.click(create);
    expect(onCreate).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "New MCP token" })).toBeVisible();
    expect(onCloseResult).not.toHaveBeenCalled();
  });

  it("says a refusal once, inside the dialog", async () => {
    const user = userEvent.setup();
    const { rerender } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    rerender({ createError: "Too many requests. Try again in 30 seconds." });

    const dialog = screen.getByRole("dialog", { name: "New MCP token" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Too many requests. Try again in 30 seconds.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("an outside press closes the create step (the result step keeps it)", async () => {
    const user = userEvent.setup();
    const { onCloseResult } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    await screen.findByRole("dialog", { name: "New MCP token" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCloseResult).toHaveBeenCalledOnce();
  });

  it("Cancel and the close button close it and reset", async () => {
    const user = userEvent.setup();
    const { onCloseResult } = renderTab();

    await user.click(screen.getByRole("button", { name: "New token" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onCloseResult).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "New token" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "New token" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onCloseResult).toHaveBeenCalledTimes(2);
  });
});

describe("McpTab token result", () => {
  async function created() {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    const view = renderTab();
    await user.click(screen.getByRole("button", { name: "New token" }));
    view.rerender({ created: CREATED });
    const dialog = screen.getByRole("dialog", { name: "Your token is ready" });
    return { ...view, user, writeText, dialog };
  }

  it("shows the token in full once, with the warning, and hands focus to its title", async () => {
    const { dialog } = await created();

    expect(dialog).toHaveAttribute("data-step", "result");
    expect(dialog).toHaveAccessibleDescription(
      "Claude Code · Read only · ends 90 days after its last use",
    );
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Copy it now. Applika shows it only once. Lost it? Create a new token and revoke this one.",
    );
    expect(
      dialog.querySelector('[data-slot="mcp-token-value"]'),
    ).toHaveTextContent(TOKEN);
    expect(
      within(dialog).getByRole("group", { name: "Token" }),
    ).toContainElement(
      within(dialog).getByRole("button", { name: "Copy the token" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Your token is ready" }),
      ).toHaveFocus(),
    );
  });

  it("copies the token", async () => {
    const { user, writeText, dialog } = await created();

    await user.click(
      within(dialog).getByRole("button", { name: "Copy the token" }),
    );
    expect(writeText).toHaveBeenCalledWith(TOKEN);
    expect(
      within(dialog).getByRole("button", { name: "Token copied" }),
    ).toBeInTheDocument();
  });

  it("offers a ready-to-paste configuration with Copy for each of the seven apps", async () => {
    const { user, writeText, dialog } = await created();

    const apps = within(dialog).getByRole("tablist", { name: "AI app" });
    expect(
      within(apps)
        .getAllByRole("tab")
        .map((app) => app.textContent),
    ).toEqual([
      "Claude Code",
      "Claude Desktop",
      "Cursor",
      "VS Code",
      "Codex CLI",
      "Gemini CLI",
      "Other",
    ]);
    const config = () =>
      dialog.querySelector<HTMLElement>('[data-slot="mcp-config"]')!;
    const where = () =>
      dialog.querySelector<HTMLElement>('[data-slot="mcp-config-where"]')!;
    expect(config()).toHaveAttribute("data-client", "claude_code");
    expect(config()).toHaveTextContent(
      `claude mcp add --transport http --scope user applika ${ENDPOINT}`,
    );
    expect(config()).toHaveTextContent(`Authorization: Bearer ${TOKEN}`);
    expect(where()).toHaveTextContent(
      "Run it in a terminal. --scope user adds it to your user settings, not to a project.",
    );

    const expected: [string, string, string, string][] = [
      ["Claude Desktop", "claude_desktop", "json", "mcp-remote"],
      ["Cursor", "cursor", "json", "~/.cursor/mcp.json"],
      ["VS Code", "vscode", "json", '"type": "http"'],
      ["Codex CLI", "codex", "toml", "http_headers"],
      ["Gemini CLI", "gemini", "json", "httpUrl"],
      ["Other", "other", "text", "Address"],
    ];
    for (const [name, client, kind, mark] of expected) {
      await user.click(within(apps).getByRole("tab", { name }));
      expect(config()).toHaveAttribute("data-client", client);
      expect(config()).toHaveAttribute("data-kind", kind);
      expect(`${config().textContent} ${where().textContent}`).toContain(mark);
      expect(config()).toHaveTextContent(TOKEN);
      await user.click(
        within(dialog).getByRole("button", { name: "Copy the configuration" }),
      );
      expect(writeText).toHaveBeenLastCalledWith(config().textContent);
    }
  });

  it("a click outside keeps it; Done closes it, resets, and puts focus back on New token", async () => {
    const { user, onCloseResult, rerender, dialog } = await created();

    // Radix hears an outside press on the document's pointerdown.
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);
    expect(dialog).toBeInTheDocument();
    expect(onCloseResult).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(onCloseResult).toHaveBeenCalledOnce();
    rerender({ created: null });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(TOKEN)).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New token" })).toHaveFocus(),
    );
  });

  it("Escape closes it too", async () => {
    const { user, onCloseResult } = await created();

    await user.keyboard("{Escape}");
    expect(onCloseResult).toHaveBeenCalledOnce();
  });
});

describe("McpTab revoke", () => {
  it("revokes after a confirm that names the token; Cancel does nothing", async () => {
    const user = userEvent.setup();
    const { onRevoke } = renderTab();

    const revoke = within(row("m2")).getByRole("button", {
      name: "Revoke the token Cursor",
    });
    await user.click(revoke);
    let confirm = screen.getByRole("alertdialog", {
      name: "Revoke the token Cursor?",
    });
    expect(confirm).toHaveTextContent(
      "Apps that use it lose access on their next call. To connect again, create a new token.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(onRevoke).not.toHaveBeenCalled();

    await user.click(revoke);
    confirm = screen.getByRole("alertdialog");
    await user.click(
      within(confirm).getByRole("button", { name: "Revoke token" }),
    );
    expect(onRevoke).toHaveBeenCalledWith(CURSOR);
  });

  it("a pending row is aria-busy and opens nothing; when it leaves, focus lands on Active", async () => {
    const user = userEvent.setup();
    const { onRevoke, rerender } = renderTab();

    await user.click(
      within(row("m2")).getByRole("button", {
        name: "Revoke the token Cursor",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Revoke token" }));
    rerender({ revokingId: "m2" });
    const pending = within(row("m2")).getByRole("button", {
      name: "Revoke the token Cursor",
    });
    expect(pending).toHaveAttribute("aria-busy", "true");
    await user.click(pending);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onRevoke).toHaveBeenCalledOnce();

    (document.activeElement as HTMLElement | null)?.blur();
    rerender({ revokingId: null, sessions: [CLAUDE, GEMINI] });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 3, name: "Active" }),
      ).toHaveFocus(),
    );
  });
});

describe("McpTab in Portuguese", () => {
  it("writes the tab, the rows and the dialog in Portuguese; names and the address stay", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      <McpTab
        sessions={[CLAUDE]}
        endpoint={ENDPOINT}
        now={NOW}
        onCreate={vi.fn()}
        onCloseResult={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Conexões MCP" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Claude Code on my laptop")).toBeInTheDocument();
    expect(screen.getByText("Leitura e escrita")).toBeInTheDocument();
    expect(screen.getByText(ENDPOINT)).toBeInTheDocument();
    expect(
      within(row("m1"))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual([
      "Criado",
      "Último uso",
      "Endereço IP",
      "Termina se não for usado",
    ]);

    await user.click(screen.getByRole("button", { name: "Novo token" }));
    const dialog = screen.getByRole("dialog", { name: "Novo token MCP" });
    expect(within(dialog).getByRole("textbox", { name: "Nome" })).toHaveValue(
      "Conexão MCP",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Leitura e escrita" }),
    ).toBeChecked();
  });

  it("writes the token result in Portuguese", async () => {
    await renderInPortuguese(
      <McpTab
        sessions={[]}
        endpoint={ENDPOINT}
        now={NOW}
        onCreate={vi.fn()}
        onCloseResult={vi.fn()}
        onRevoke={vi.fn()}
        created={CREATED}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Seu token está pronto",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Claude Code · Somente leitura · termina 90 dias após o último uso",
    );
    expect(
      within(dialog).getByRole("tab", { name: "Outro" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copiar o token" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Pronto" }),
    ).toBeVisible();
  });
});

function axiosRefusal(status: number, data: unknown, retryAfter?: string) {
  const headers = new AxiosHeaders();
  if (retryAfter) headers.set("retry-after", retryAfter);
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "refused",
    headers,
    config: {} as never,
    data,
  });
}

describe("MCP tab wired to the API (use-sessions)", () => {
  const list = vi.mocked(services.sessions.list);
  const create = vi.mocked(services.sessions.createMcpToken);
  const revoke = vi.mocked(services.sessions.revoke);

  beforeEach(() => {
    list.mockReset().mockResolvedValue([WEB, CLAUDE]);
    create.mockReset().mockResolvedValue(CREATED);
    revoke.mockReset().mockResolvedValue(undefined);
  });

  function renderWired() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <ProfileMcp />
      </QueryClientProvider>,
    );
    return client;
  }

  it("creates a token for the signed-in user, shows it once, refreshes the list, and forgets it on Done", async () => {
    const user = userEvent.setup();
    const client = renderWired();
    await screen.findByText("Claude Code on my laptop");
    expect(screen.getByText(APP_CONFIG.mcp.endpoint)).toBeInTheDocument();

    list.mockResolvedValue([
      WEB,
      CLAUDE,
      session("m9", { device_name: "Claude Code", scope: ["read"] }),
    ]);
    await user.click(screen.getByRole("button", { name: "New token" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Claude Code");
    await user.click(screen.getByRole("radio", { name: "Read only" }));
    await user.click(screen.getByRole("button", { name: "Create token" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Your token is ready",
    });
    expect(create).toHaveBeenCalledWith({
      name: "Claude Code",
      scope: ["read"],
    });
    expect(
      dialog.querySelector('[data-slot="mcp-token-value"]'),
    ).toHaveTextContent(TOKEN);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(TOKEN);

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body).not.toHaveTextContent(TOKEN);
    // Opening it again starts over: no token, the defaults back.
    await user.click(screen.getByRole("button", { name: "New token" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "MCP connection",
    );
    expect(document.body).not.toHaveTextContent(TOKEN);
  });

  it("says a rate-limited create inside the dialog, with its wait", async () => {
    const user = userEvent.setup();
    create.mockRejectedValue(
      axiosRefusal(
        429,
        { detail: "x", code: "GEN-1004", params: { seconds: 30 } },
        "30",
      ),
    );
    renderWired();
    await screen.findByText("Claude Code on my laptop");

    await user.click(screen.getByRole("button", { name: "New token" }));
    await user.click(screen.getByRole("button", { name: "Create token" }));

    const dialog = screen.getByRole("dialog", { name: "New MCP token" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Too many requests. Try again in 30 seconds.",
    );
  });

  it("revokes a connection with DELETE and refetches the list", async () => {
    const user = userEvent.setup();
    renderWired();
    await screen.findByText("Claude Code on my laptop");

    list.mockResolvedValue([WEB]);
    await user.click(
      screen.getByRole("button", {
        name: "Revoke the token Claude Code on my laptop",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Revoke token" }));

    await waitFor(() => expect(revoke).toHaveBeenCalledWith("m1"));
    expect(
      await screen.findByText("No MCP connections yet"),
    ).toBeInTheDocument();
  });

  it("a failed load shows the error, and Try again refetches", async () => {
    const user = userEvent.setup();
    list.mockRejectedValueOnce(new Error("down"));
    renderWired();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load your MCP connections");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Claude Code on my laptop"),
    ).toBeInTheDocument();
  });
});
