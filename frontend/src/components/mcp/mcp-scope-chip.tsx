"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  MCP_SCOPE_TONE,
  mcpScopeChoice,
  type McpScopeChoice,
  type McpScopeTone,
} from "./mcp-scope";

/** DeskMcpTab.dc.html's `.pill` / `.pill.pri` / `.pill.warn`. */
const DESKTOP_TONE: Record<McpScopeTone, string> = {
  muted: "bg-muted text-foreground",
  pri: "bg-primary-muted text-accent-foreground",
  warn: "bg-warning/22 text-foreground",
};

/** Main.dc.html's `.pill` / `.pill.pri` / `.pill.warn` (22%, not `.ph-warn`'s 18%). */
const PHONE_TONE: Record<McpScopeTone, string> = {
  muted: "",
  pri: "ph-pri",
  warn: "ph-mt-full",
};

/** The words of a choice, for a chip, a summary line or a label. */
export function useMcpScopeLabel(): (choice: McpScopeChoice) => string {
  const t = useTranslations("mcpScope");
  return (choice) => t(`${choice}.title`);
}

export interface McpScopeChipProps {
  /** A session's or a token's `scope`. */
  scope: readonly string[] | null | undefined;
  variant?: "desktop" | "phone";
  id?: string;
  className?: string;
}

/**
 * A token's scope as the boards draw it: Read only (muted), Read and write
 * (primary), Full access (warning). A set the form never offers shows its
 * names as sent; a row without a scope shows nothing.
 */
export function McpScopeChip({
  scope,
  variant = "desktop",
  id,
  className,
}: McpScopeChipProps) {
  const label = useMcpScopeLabel();
  if (!scope || scope.length === 0) return null;
  const choice = mcpScopeChoice(scope);
  const tone = choice ? MCP_SCOPE_TONE[choice] : "muted";
  const words = choice ? label(choice) : scope.join(" ");

  if (variant === "phone") {
    return (
      <span
        id={id}
        data-slot="mcp-scope"
        data-scope={choice ?? undefined}
        className={cn("ph-pill", PHONE_TONE[tone], className)}
      >
        <span className="truncate">{words}</span>
      </span>
    );
  }

  return (
    <Badge
      id={id}
      variant="ghost"
      data-slot="mcp-scope"
      data-scope={choice ?? undefined}
      className={cn(
        "h-[22px] py-0 text-xs font-semibold",
        DESKTOP_TONE[tone],
        className,
      )}
    >
      {words}
    </Badge>
  );
}
