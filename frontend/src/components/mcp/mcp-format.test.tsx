import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import type { UserSession } from "@/services/types/sessions";

import { activeMcpSessions, useMcpDates } from "./mcp-format";

function session(id: string, overrides: Partial<UserSession>): UserSession {
  return {
    id,
    client_type: "mcp",
    sign_in_method: "mcp_token",
    device_name: id,
    client_label: "Unknown device",
    created_ip: null,
    last_ip: null,
    created_at: "2026-11-01T09:00:00Z",
    last_used_at: null,
    expires_at: "2027-02-01T09:00:00Z",
    ended_at: null,
    status: "active",
    current: false,
    scope: ["read"],
    ...overrides,
  };
}

describe("activeMcpSessions", () => {
  it("keeps the active MCP rows only, in the server's order", () => {
    const list = [
      session("web", { client_type: "web", scope: null }),
      session("b", {}),
      session("cli", { client_type: "cli", scope: null }),
      session("ended", { status: "revoked" }),
      session("a", {}),
    ];

    expect(activeMcpSessions(list).map((row) => row.id)).toEqual(["b", "a"]);
    expect(activeMcpSessions(undefined)).toEqual([]);
  });
});

function datesIn(locale: "en" | "pt-BR", now: Date) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ptBR}
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useMcpDates(now), { wrapper }).result.current;
}

// Saturday 14 November 2026, 12:00 UTC (the test clock runs in UTC via the provider).
const NOW = new Date("2026-11-14T12:00:00Z");

describe("useMcpDates", () => {
  it("writes Created and Ends as a date without a time", () => {
    const { date } = datesIn("en", NOW);

    expect(date("2027-02-12T10:00:00Z")).toBe("Feb 12, 2027");
    expect(date("not a date")).toBe("not a date");
  });

  it("says Last used relative within a week, as a date after", () => {
    const { lastUsed } = datesIn("en", NOW);
    const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

    expect(lastUsed(ago(20 * 1000))).toBe("Now");
    expect(lastUsed(ago(2 * 60 * 1000))).toBe("2 minutes ago");
    expect(lastUsed(ago(3 * 60 * 60 * 1000))).toBe("3 hours ago");
    expect(lastUsed(ago(8 * 7 * 24 * 60 * 60 * 1000))).toBe("Sep 19, 2026");
    expect(lastUsed("not a date")).toBe("not a date");
  });

  it("speaks Portuguese", () => {
    const { date, lastUsed } = datesIn("pt-BR", NOW);

    expect(date("2027-02-12T10:00:00Z")).toBe("12 de fev. de 2027");
    expect(
      lastUsed(new Date(NOW.getTime() - 2 * 60 * 1000).toISOString()),
    ).toBe("Há 2 minutos");
  });
});
