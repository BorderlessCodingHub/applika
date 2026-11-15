"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { RadioGroup } from "radix-ui";

import { cn } from "@/lib/utils";

import {
  DEFAULT_MCP_SCOPE,
  MCP_SCOPE_CHOICES,
  MCP_SCOPE_OF,
  type McpScopeChoice,
} from "./mcp-scope";

export {
  DEFAULT_MCP_SCOPE,
  MCP_SCOPE_CHOICES,
  MCP_SCOPE_OF,
  mcpScopeChoice,
  type McpScopeChoice,
} from "./mcp-scope";

export interface McpScopePickerProps {
  value: McpScopeChoice;
  onChange: (choice: McpScopeChoice) => void;
  /** `desktop`: DeskCreate.dc.html's cards; `phone`: McpCreate.dc.html's. */
  variant?: "desktop" | "phone";
  disabled?: boolean;
  className?: string;
}

const DESKTOP = {
  legend: "mb-2 text-[13px] font-semibold text-foreground",
  item: "relative flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-3.5 py-3 text-left text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary-muted",
  radio:
    "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-border-strong",
  radioOn: "border-primary",
  dot: "size-2 rounded-full bg-primary",
  text: "min-w-0 flex-1",
  title: "flex items-center gap-2 text-sm font-semibold",
  rec: "inline-flex h-5 items-center rounded-full bg-primary-muted px-2 text-[11px] font-semibold whitespace-nowrap text-accent-foreground",
  body: "mt-0.5 block text-[13px] leading-[1.45] text-muted-foreground",
} as const;

const PHONE = {
  legend: "ph-lbl ph-mt-legend",
  item: "ph-opt ph-mt-opt",
  radio: "ph-radio",
  radioOn: "",
  dot: "",
  text: "ph-mt-opt-text",
  title: "ph-mt-opt-t",
  rec: "ph-mt-rec",
  body: "ph-mt-opt-b",
} as const;

/**
 * "What can it do?": Read only, Read and write (preselected, Recommended)
 * and Full access, each saying what it allows. Controlled. Each radio is
 * named by its title alone; "Recommended" and the body describe it.
 */
export function McpScopePicker({
  value,
  onChange,
  variant = "desktop",
  disabled,
  className,
}: McpScopePickerProps) {
  const t = useTranslations("mcpScope");
  const legendId = useId();
  const ids = useId();
  const look = variant === "phone" ? PHONE : DESKTOP;

  return (
    <div data-slot="mcp-scope-picker" className={className}>
      <p id={legendId} className={look.legend}>
        {t("legend")}
      </p>
      <RadioGroup.Root
        aria-labelledby={legendId}
        orientation="vertical"
        value={value}
        onValueChange={(next) => {
          const choice = MCP_SCOPE_CHOICES.find((item) => item === next);
          if (choice) onChange(choice);
        }}
        disabled={disabled}
        className="flex flex-col gap-2"
      >
        {MCP_SCOPE_CHOICES.map((choice) => {
          const checked = choice === value;
          const recommended = choice === DEFAULT_MCP_SCOPE;
          const titleId = `${ids}-${choice}-t`;
          const recId = `${ids}-${choice}-r`;
          const bodyId = `${ids}-${choice}-b`;
          return (
            <RadioGroup.Item
              key={choice}
              value={choice}
              data-scope={choice}
              data-scope-names={MCP_SCOPE_OF[choice].join(" ")}
              aria-labelledby={titleId}
              aria-describedby={recommended ? `${recId} ${bodyId}` : bodyId}
              className={cn(
                look.item,
                variant === "phone" && checked && "ph-on",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(look.radio, checked && look.radioOn)}
              >
                {checked && look.dot ? <span className={look.dot} /> : null}
              </span>
              <span className={look.text}>
                <span className={look.title}>
                  <span id={titleId}>{t(`${choice}.title`)}</span>
                  {recommended ? (
                    <span id={recId} className={look.rec}>
                      {t("recommended")}
                    </span>
                  ) : null}
                </span>
                <span id={bodyId} className={look.body}>
                  {t(`${choice}.body`)}
                </span>
              </span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
    </div>
  );
}
