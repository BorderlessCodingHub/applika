"use client";

import { useEffect, useState, type RefObject } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** How long a copy button says "Copied". */
export const MCP_COPIED_MS = 2000;

/** A refused clipboard: select the text, so Ctrl+C or the system menu still copies it. */
function selectContents(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export interface McpCopyButtonProps {
  /** What lands on the clipboard. */
  text: string;
  /** The idle name ("Copy the token"). */
  label: string;
  /** The name for `copiedMs` after a copy ("Token copied"), also said once by a status region. */
  doneLabel: string;
  /**
   * `phone`: the boards' 44px `.copy` icon (pass its class: `ph-mt-copy`,
   * `ph-mcp-copy`); `desk-icon`: DeskMcpTab's 36px icon; `desk-text`:
   * DeskToken's "Copy" / "Copied" (`size="lg"` is DeskMcpPage's 40px one).
   */
  variant: "phone" | "desk-icon" | "desk-text";
  size?: "default" | "lg";
  /** Selected when the clipboard refuses. */
  selectOnFail?: RefObject<HTMLElement | null>;
  copiedMs?: number;
  className?: string;
  "data-action"?: string;
}

/**
 * Copy, then "Copied" for a moment; a refused clipboard selects the text
 * instead and says so in the same status region.
 */
export function McpCopyButton({
  text,
  label,
  doneLabel,
  variant,
  size = "default",
  selectOnFail,
  copiedMs = MCP_COPIED_MS,
  className,
  "data-action": action,
}: McpCopyButtonProps) {
  const t = useTranslations("mcpCopy");
  const [copied, setCopied] = useState(false);
  // The clipboard refused: the status says the text is selected instead.
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    if (!copied && !refused) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setRefused(false);
    }, copiedMs);
    return () => window.clearTimeout(timer);
  }, [copied, refused, copiedMs]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setRefused(false);
      setCopied(true);
    } catch {
      setCopied(false);
      if (selectOnFail?.current) selectContents(selectOnFail.current);
      setRefused(true);
    }
  };

  const iconSize = variant === "phone" ? 18 : 16;
  const icon = copied ? (
    <Check size={iconSize} strokeWidth={2.25} aria-hidden="true" />
  ) : (
    <Copy size={iconSize} aria-hidden="true" />
  );

  return (
    <>
      <button
        type="button"
        data-action={action}
        data-done={copied ? "true" : "false"}
        aria-label={copied ? doneLabel : label}
        onClick={() => void copy()}
        className={cn(
          variant === "desk-icon" &&
            "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[done=true]:text-primary",
          variant === "desk-text" &&
            "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[done=true]:text-primary",
          variant === "desk-text" && size === "lg" && "h-10 px-3",
          className,
        )}
      >
        {variant === "desk-text" ? (copied ? t("copied") : t("copy")) : icon}
      </button>
      {/* Mounted empty: a live region inserted with its words may not be read. */}
      <span role="status" className="sr-only">
        {copied ? doneLabel : refused ? t("refused") : ""}
      </span>
    </>
  );
}
