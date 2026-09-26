"use client";

import { useEffect, useId, useRef } from "react";
import { CircleCheck, Link2, Loader2, TriangleAlert } from "lucide-react";

import { DiscordIcon } from "@/components/brand-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DiscordAccount } from "@/services/types/users";

export interface ConnectedDiscordAccount {
  name: string;
  avatarUrl: string | null;
  needsReconnect: boolean;
}

export type DiscordCardState = "linked" | "unlinked" | "needs_reconnect";

/**
 * `User.discord` (the wire shape) to the card's own `account` prop — the ONE
 * place `global_name || username` (never `??`, an empty string still falls
 * back) and `status === "needs_reconnect"` are derived, so `profile-view.tsx`
 * and any test can both exercise the real mapping instead of pre-built props.
 */
export function toConnectedDiscordAccount(
  discord: DiscordAccount | null,
): ConnectedDiscordAccount | null {
  if (!discord) return null;
  return {
    name: discord.global_name || discord.username,
    avatarUrl: discord.avatar_url,
    needsReconnect: discord.status === "needs_reconnect",
  };
}

export interface ConnectedAccountsProps {
  account?: ConnectedDiscordAccount | null;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
  isDisconnecting?: boolean;
  className?: string;
}

const HELPER: Record<DiscordCardState, string> = {
  unlinked:
    "Connect to post your reports to the configured Discord servers you are in. Posts mention you.",
  linked:
    "Your reports are posted to the configured Discord servers you are in, and posts mention you.",
  needs_reconnect:
    "Discord no longer accepts this connection, so your reports are not posted until you reconnect. Feedback posts still mention you.",
};

export function discordCardState(
  account: ConnectedDiscordAccount | null | undefined,
): DiscordCardState {
  if (!account) return "unlinked";
  return account.needsReconnect ? "needs_reconnect" : "linked";
}

export function ConnectedAccounts({
  account = null,
  onConnect,
  onDisconnect,
  isConnecting = false,
  isDisconnecting = false,
  className,
}: ConnectedAccountsProps) {
  const headingId = useId();
  const actionRef = useRef<HTMLDivElement>(null);
  const state = discordCardState(account);
  const linked = account != null;
  const previousLinked = useRef(linked);
  const handOffFocus = useRef(false);

  // A confirmed Disconnect unmounts the focused trigger; move focus to Connect, never on a refetch.
  useEffect(() => {
    if (previousLinked.current === linked) return;
    previousLinked.current = linked;
    if (!handOffFocus.current) return;
    handOffFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    actionRef.current?.querySelector("button")?.focus();
  }, [linked]);

  const confirmDisconnect = () => {
    handOffFocus.current = true;
    onDisconnect();
  };

  const busyIcon = (
    <Loader2 aria-hidden data-icon="inline-start" className="animate-spin" />
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-xl bg-card shadow-card",
        className,
      )}
    >
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Link2 aria-hidden className="h-4 w-4 text-muted-foreground" />
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            Connected accounts
          </h2>
        </div>
      </div>

      <ul className="divide-y divide-border">
        <li
          data-provider="discord"
          data-state={state}
          className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            {account ? (
              <span aria-hidden className="relative shrink-0">
                <Avatar size="lg">
                  {account.avatarUrl ? (
                    <AvatarImage src={account.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <DiscordIcon aria-hidden className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card",
                    account.needsReconnect ? "bg-warning" : "bg-success",
                  )}
                />
              </span>
            ) : (
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <DiscordIcon className="size-5" />
              </span>
            )}

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm leading-none font-semibold text-foreground">
                  Discord
                </h3>
                {state === "linked" ? (
                  <Badge
                    variant="outline"
                    className="border-success/30 bg-success/10 text-success"
                  >
                    <CircleCheck aria-hidden />
                    Discord connected
                  </Badge>
                ) : state === "needs_reconnect" ? (
                  <Badge
                    variant="outline"
                    className="border-warning/40 bg-warning/10 text-foreground"
                  >
                    <TriangleAlert aria-hidden className="text-warning" />
                    Reconnect needed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not connected
                  </Badge>
                )}
              </div>
              {account ? (
                <p
                  data-slot="discord-account-name"
                  className="text-sm font-medium break-words text-foreground"
                >
                  Connected as {account.name}
                </p>
              ) : null}
              <p className="text-sm text-pretty text-muted-foreground">
                {HELPER[state]}
              </p>
            </div>
          </div>

          <div
            ref={actionRef}
            className="flex flex-col gap-2 sm:shrink-0 sm:flex-row"
          >
            {state === "needs_reconnect" ? (
              <Button
                type="button"
                size="sm"
                onClick={onConnect}
                disabled={isConnecting}
                aria-busy={isConnecting || undefined}
                className="w-full sm:w-auto"
              >
                {isConnecting ? busyIcon : null}
                Reconnect Discord
              </Button>
            ) : null}
            {account ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isDisconnecting}
                    aria-busy={isDisconnecting || undefined}
                    className="w-full hover:border-destructive/40 sm:w-auto"
                  >
                    {isDisconnecting ? busyIcon : null}
                    Disconnect Discord
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Discord?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your reports will no longer be posted to Discord, and
                      feedback posts will stop mentioning you. You can connect
                      Discord again at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={confirmDisconnect}
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onConnect}
                disabled={isConnecting}
                aria-busy={isConnecting || undefined}
                className="w-full sm:w-auto"
              >
                {isConnecting ? busyIcon : null}
                Connect Discord
              </Button>
            )}
          </div>
        </li>
      </ul>
    </section>
  );
}
