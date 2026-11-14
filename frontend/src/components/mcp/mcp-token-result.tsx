"use client";

import { useId, useRef, useState, type ReactNode, type Ref } from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  MCP_CLIENTS,
  buildMcpConfigs,
  type McpClient,
  type McpConfig,
} from "./mcp-configs";
import { McpCopyButton } from "./mcp-copy-button";
import { MCP_DESK_BTN, MCP_DESK_BTN_PRI } from "./mcp-create-form";
import { mcpScopeChoice } from "./mcp-scope";
import { useMcpScopeLabel } from "./mcp-scope-chip";

export interface McpTokenResultProps {
  /** `desktop`: DeskToken.dc.html's dialog body; `phone`: McpToken.dc.html's sheet body and foot. */
  variant: "desktop" | "phone";
  /** As the server saved them (trimmed, defaulted). */
  name: string;
  scope: readonly string[];
  /** Shown here once: kept in props and state only, never stored, cached or logged. */
  token: string;
  /** `APP_CONFIG.mcp.endpoint`. */
  endpoint: string;
  onDone: () => void;
  /** Takes the focus when the create form's button left with the swap. */
  titleRef?: Ref<HTMLHeadingElement>;
}

/** DeskToken's `.term` and its `pre` (12.5px, 1.7). */
const DESK_TERM =
  "flex items-start gap-1 rounded-xl border border-border bg-background py-1 pr-1";
const DESK_PRE =
  "m-0 min-w-0 flex-1 overflow-x-auto py-2.5 pl-3.5 font-numeric text-[12.5px] leading-[1.7] whitespace-pre text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const DESK_LBL = "text-[13px] font-semibold text-foreground";
const DESK_HINT = "m-0 text-[13px] leading-normal text-muted-foreground";

/**
 * "Your token is ready": the token once, with the warning and Copy, then a
 * ready-to-paste configuration with the token filled in for each app and
 * Copy, then Done. The token never leaves this component's props.
 */
export function McpTokenResult({
  variant,
  name,
  scope,
  token,
  endpoint,
  onDone,
  titleRef,
}: McpTokenResultProps) {
  const t = useTranslations("mcpToken");
  const tConfig = useTranslations("mcpConfig");
  const scopeLabel = useMcpScopeLabel();
  const choice = mcpScopeChoice(scope);
  const tokenLabelId = useId();
  const tokenRef = useRef<HTMLPreElement>(null);
  const configRef = useRef<HTMLPreElement>(null);
  const [client, setClient] = useState<McpClient>("claude_code");
  const phone = variant === "phone";

  const configs = buildMcpConfigs(endpoint, token, {
    layout: phone ? "narrow" : "wide",
    otherWords: {
      address: tConfig("otherAddress"),
      header: tConfig("otherHeader"),
    },
  });
  const config = configs.find((item) => item.client === client) ?? configs[0];
  const clientLabel = (item: McpConfig) => item.label ?? tConfig("other");
  const summary = t("summary", {
    name,
    scope: choice ? scopeLabel(choice) : scope.join(" "),
  });
  const ask = (chunks: ReactNode) => (
    <span className={phone ? "ph-strong" : "text-foreground"}>{chunks}</span>
  );

  if (phone) {
    return (
      <div data-slot="mcp-token-result" className="ph-mt-pane">
        <div className="ph-mt-sheet-body ph-mt-tight">
          <div>
            <DialogPrimitive.Title
              ref={titleRef}
              tabIndex={-1}
              className="ph-h2 ph-mt-sheet-h ph-focus-target"
            >
              {t("title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="ph-hint ph-dv-lead">
              {summary}
            </DialogPrimitive.Description>
          </div>

          <div role="note" className="ph-mt-warn">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>{t("warning")}</span>
          </div>

          <div className="ph-mt-tok">
            <span id={tokenLabelId} className="ph-lbl">
              {t("tokenLabel")}
            </span>
            <div
              role="group"
              aria-labelledby={tokenLabelId}
              className="ph-mt-term"
            >
              <pre
                ref={tokenRef}
                data-slot="mcp-token-value"
                className="ph-mono ph-hs"
              >
                {token}
              </pre>
              <McpCopyButton
                variant="phone"
                className="ph-mt-copy"
                text={token}
                label={t("copyToken")}
                doneLabel={t("tokenCopied")}
                selectOnFail={tokenRef}
                data-action="copy-token"
              />
            </div>
          </div>

          <div className="ph-mt-add">
            <h2 className="ph-h2 ph-mt-h2">{t("addTitle")}</h2>
            <div
              role="group"
              aria-label={t("appGroup")}
              data-slot="mcp-clients"
              className="ph-hs ph-mt-chips"
            >
              {configs.map((item) => (
                <button
                  key={item.client}
                  type="button"
                  data-client={item.client}
                  aria-pressed={item.client === client}
                  className="ph-chip ph-mt-chip"
                  onClick={() => setClient(item.client)}
                >
                  {clientLabel(item)}
                </button>
              ))}
            </div>
            <p data-slot="mcp-config-where" className="ph-hint">
              {tConfig(`where.${config.client}`)}
            </p>
            <div className="ph-mt-term">
              <pre
                ref={configRef}
                data-slot="mcp-config"
                data-client={config.client}
                data-kind={config.kind}
                className="ph-mono ph-hs"
              >
                {config.text}
              </pre>
              <McpCopyButton
                key={config.client}
                variant="phone"
                className="ph-mt-copy"
                text={config.text}
                label={t("copyConfig")}
                doneLabel={t("configCopied")}
                selectOnFail={configRef}
                data-action="copy-config"
              />
            </div>
            <p className="ph-hint">{t.rich("keep", { ask })}</p>
          </div>
        </div>

        <div className="ph-mt-foot">
          <button
            type="button"
            data-action="mcp-token-done"
            className="ph-btn ph-pri"
            onClick={onDone}
          >
            {t("done")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-slot="mcp-token-result" className="flex flex-col gap-[18px]">
      <div>
        <DialogPrimitive.Title
          ref={titleRef}
          tabIndex={-1}
          className="m-0 text-lg font-bold text-foreground outline-none"
        >
          {t("title")}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className={cn(DESK_HINT, "mt-1")}>
          {summary}
        </DialogPrimitive.Description>
      </div>

      <div
        role="note"
        className="flex items-center gap-2.5 rounded-[10px] bg-warning/16 px-3.5 py-2.5 text-[13px] leading-[1.45] font-medium text-foreground"
      >
        <TriangleAlert
          aria-hidden="true"
          className="size-[18px] shrink-0 text-warning"
        />
        <span>{t("warning")}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={tokenLabelId} className={DESK_LBL}>
          {t("tokenLabel")}
        </span>
        <div role="group" aria-labelledby={tokenLabelId} className={DESK_TERM}>
          <pre ref={tokenRef} data-slot="mcp-token-value" className={DESK_PRE}>
            {token}
          </pre>
          <McpCopyButton
            variant="desk-text"
            text={token}
            label={t("copyToken")}
            doneLabel={t("tokenCopied")}
            selectOnFail={tokenRef}
            data-action="copy-token"
          />
        </div>
      </div>

      <Tabs
        value={client}
        onValueChange={(next) => {
          const picked = MCP_CLIENTS.find((item) => item === next);
          if (picked) setClient(picked);
        }}
        className="gap-2.5"
      >
        <span className={DESK_LBL}>{t("addTitle")}</span>
        <TabsList
          variant="line"
          aria-label={t("appGroup")}
          data-slot="mcp-clients"
          className="gap-1 group-data-[orientation=horizontal]/tabs:h-[38px]"
        >
          {configs.map((item) => (
            <TabsTrigger
              key={item.client}
              value={item.client}
              data-client={item.client}
              className="text-[13px] group-data-[variant=line]/tabs-list:px-3 data-[state=active]:font-semibold"
            >
              {clientLabel(item)}
            </TabsTrigger>
          ))}
        </TabsList>
        {configs.map((item) => (
          <TabsContent
            key={item.client}
            value={item.client}
            className="flex flex-col gap-2"
          >
            <p data-slot="mcp-config-where" className={DESK_HINT}>
              {tConfig(`where.${item.client}`)}
            </p>
            <div className={DESK_TERM}>
              <pre
                ref={item.client === client ? configRef : undefined}
                data-slot="mcp-config"
                data-client={item.client}
                data-kind={item.kind}
                className={DESK_PRE}
              >
                {item.text}
              </pre>
              <McpCopyButton
                variant="desk-text"
                text={item.text}
                label={t("copyConfig")}
                doneLabel={t("configCopied")}
                selectOnFail={configRef}
                data-action="copy-config"
              />
            </div>
            <p className={DESK_HINT}>{t.rich("keep", { ask })}</p>
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-end">
        <Button
          type="button"
          data-action="mcp-token-done"
          className={cn(MCP_DESK_BTN, MCP_DESK_BTN_PRI)}
          onClick={onDone}
        >
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
