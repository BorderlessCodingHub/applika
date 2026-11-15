import type { McpScopeName } from "@/services/types/sessions";

/** The three choices the create form offers (ADR-0028), in the boards' order. */
export const MCP_SCOPE_CHOICES = ["read", "read_write", "full"] as const;

export type McpScopeChoice = (typeof MCP_SCOPE_CHOICES)[number];

/** What each choice sends as `scope`. */
export const MCP_SCOPE_OF: Readonly<
  Record<McpScopeChoice, readonly McpScopeName[]>
> = {
  read: ["read"],
  read_write: ["read", "write"],
  full: ["read", "write", "delete"],
};

/** Preselected and marked "Recommended". */
export const DEFAULT_MCP_SCOPE: McpScopeChoice = "read_write";

/** The pill each choice wears: muted, primary, warning (Main.dc.html l.114-116). */
export type McpScopeTone = "muted" | "pri" | "warn";

export const MCP_SCOPE_TONE: Readonly<Record<McpScopeChoice, McpScopeTone>> = {
  read: "muted",
  read_write: "pri",
  full: "warn",
};

/** The choice a session's `scope` was created with; `null` for a web or cli row, or a set the form never offers. */
export function mcpScopeChoice(
  scope: readonly string[] | null | undefined,
): McpScopeChoice | null {
  if (!scope || scope.length === 0) return null;
  const names = new Set(scope);
  return (
    MCP_SCOPE_CHOICES.find((choice) => {
      const wanted = MCP_SCOPE_OF[choice];
      return (
        wanted.length === names.size && wanted.every((name) => names.has(name))
      );
    }) ?? null
  );
}
