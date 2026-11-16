"use client";

import { useId, useState, type Ref } from "react";
import { CircleAlert, Info, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { McpScopeName } from "@/services/types/sessions";

import {
  DEFAULT_MCP_SCOPE,
  MCP_SCOPE_OF,
  type McpScopeChoice,
} from "./mcp-scope";
import { McpScopePicker } from "./mcp-scope-picker";

/** The API's limit for a token's name. */
export const MCP_NAME_MAX = 100;

/** DeskMcpTab / DeskCreate / DeskToken `.btn` (40px, r10, 14/600) and `.btn.pri` / `.btn.sec`. */
export const MCP_DESK_BTN =
  "h-10 gap-2 rounded-[10px] px-4 text-sm font-semibold has-[>svg]:px-4";
export const MCP_DESK_BTN_PRI = "dark:shadow-glow";
export const MCP_DESK_BTN_SEC = "bg-muted text-foreground hover:bg-muted/80";

export interface McpCreateFormProps {
  /** `desktop`: DeskCreate.dc.html's dialog body; `phone`: McpCreate.dc.html's sheet body and foot. */
  variant: "desktop" | "phone";
  /** The name as typed (the server trims it; blank becomes "MCP connection") and the scope to send. */
  onSubmit: (name: string, scope: McpScopeName[]) => void;
  onCancel: () => void;
  isCreating?: boolean;
  /** The refusal in words: the server's `detail` verbatim or its code's message (ADR-0025). */
  error?: string | null;
  /** The phone title takes the focus on open (no keyboard pops up). */
  titleRef?: Ref<HTMLHeadingElement>;
}

/**
 * "New MCP token": a name (prefilled, at most 100 characters, with its
 * counter), the scope picker and Create token. Inside a Radix dialog or a
 * phone sheet (its title and description name it). Mounted on open, so each
 * opening starts from the defaults.
 */
export function McpCreateForm({
  variant,
  onSubmit,
  onCancel,
  isCreating = false,
  error = null,
  titleRef,
}: McpCreateFormProps) {
  const t = useTranslations("mcpCreate");
  const tScope = useTranslations("mcpScope");
  const nameId = useId();
  const hintId = useId();
  const [name, setName] = useState(() => t("defaultName"));
  const [choice, setChoice] = useState<McpScopeChoice>(DEFAULT_MCP_SCOPE);
  const phone = variant === "phone";

  const submit = () => {
    if (isCreating) return;
    onSubmit(name, [...MCP_SCOPE_OF[choice]]);
  };

  const createLabel = (
    <>
      {isCreating ? (
        <Loader2
          aria-hidden="true"
          data-icon="inline-start"
          size={phone ? 18 : undefined}
          className={phone ? "ph-spin" : "motion-safe:animate-spin"}
        />
      ) : null}
      {t("create")}
    </>
  );

  const failure = error ? (
    phone ? (
      <div role="alert" data-tone="error" className="ph-notice">
        <CircleAlert size={18} aria-hidden="true" className="ph-notice-ic" />
        <p>{error}</p>
      </div>
    ) : (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-[10px] border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[13px] leading-[1.45] text-foreground"
      >
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-[color:var(--destructive-text)]"
        />
        <p className="min-w-0 flex-1 wrap-anywhere">{error}</p>
      </div>
    )
  ) : null;

  const counter = (
    <span className="tabular-nums">
      {name.length}/{MCP_NAME_MAX}
    </span>
  );

  if (phone) {
    return (
      <form
        noValidate
        data-slot="mcp-create-form"
        className="ph-mt-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="ph-mt-sheet-body">
          <div>
            <DialogPrimitive.Title
              ref={titleRef}
              tabIndex={-1}
              className="ph-h2 ph-mt-sheet-h ph-focus-target"
            >
              {t("title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="ph-hint ph-dv-lead">
              {t("lead")}
            </DialogPrimitive.Description>
          </div>

          <div className="ph-field">
            <label htmlFor={nameId} className="ph-lbl">
              {t("nameLabel")}
            </label>
            <input
              id={nameId}
              name="name"
              className="ph-input ph-mt-input"
              value={name}
              maxLength={MCP_NAME_MAX}
              autoComplete="off"
              aria-describedby={hintId}
              onChange={(event) => setName(event.target.value)}
            />
            <p id={hintId} className="ph-hint ph-mt-count">
              <span>{t("nameHintPhone")}</span>
              {counter}
            </p>
          </div>

          <McpScopePicker variant="phone" value={choice} onChange={setChoice} />

          <p className="ph-hint ph-mt-note">
            <Info size={16} aria-hidden="true" />
            <span>{tScope("fixed")}</span>
          </p>

          {failure}
        </div>

        <div className="ph-mt-foot ph-mt-foot-2">
          <button type="button" className="ph-btn ph-sec" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button
            type="submit"
            data-action="create-mcp-token"
            aria-disabled={isCreating || undefined}
            aria-busy={isCreating || undefined}
            data-disabled={isCreating || undefined}
            className="ph-btn ph-pri"
          >
            {createLabel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      noValidate
      data-slot="mcp-create-form"
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <DialogPrimitive.Title className="m-0 text-lg font-bold text-foreground">
          {t("title")}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-[13px] leading-normal text-muted-foreground">
          {t("lead")}
        </DialogPrimitive.Description>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={nameId}
          className="text-[13px] leading-normal font-semibold"
        >
          {t("nameLabel")}
        </Label>
        <Input
          id={nameId}
          name="name"
          value={name}
          maxLength={MCP_NAME_MAX}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-[10px] border-border bg-background px-3 text-sm shadow-none md:text-sm"
        />
        <p
          id={hintId}
          className="flex justify-between gap-3 text-[13px] leading-normal text-muted-foreground"
        >
          <span>{t("nameHintDesktop")}</span>
          {counter}
        </p>
      </div>

      <McpScopePicker variant="desktop" value={choice} onChange={setChoice} />

      <p className="text-[13px] leading-normal text-muted-foreground">
        {tScope("fixed")}
      </p>

      {failure}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          className={cn(MCP_DESK_BTN, MCP_DESK_BTN_SEC)}
          onClick={onCancel}
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          data-action="create-mcp-token"
          aria-disabled={isCreating || undefined}
          aria-busy={isCreating || undefined}
          className={cn(
            MCP_DESK_BTN,
            MCP_DESK_BTN_PRI,
            "aria-disabled:opacity-60",
          )}
        >
          {createLabel}
        </Button>
      </div>
    </form>
  );
}

/** "New token" with the board's + (DeskMcpTab.dc.html l.71). */
export function McpNewTokenIcon({ phone = false }: { phone?: boolean }) {
  return (
    <Plus
      aria-hidden="true"
      data-icon="inline-start"
      size={phone ? 18 : 16}
      strokeWidth={2.25}
    />
  );
}
