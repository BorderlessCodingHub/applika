"use client";

import { useEffect, useId, useRef } from "react";
import { CircleCheck, Link2, Loader2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConnectedAccountsProps {
  linked: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
  isDisconnecting?: boolean;
  className?: string;
}

export function ConnectedAccounts({
  linked,
  onConnect,
  onDisconnect,
  isConnecting = false,
  isDisconnecting = false,
  className,
}: ConnectedAccountsProps) {
  const headingId = useId();
  const actionRef = useRef<HTMLDivElement>(null);
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
          data-state={linked ? "linked" : "unlinked"}
          className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "relative flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                linked
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <DiscordIcon className="size-5" />
              {linked ? (
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-card" />
              ) : null}
            </span>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm leading-none font-semibold text-foreground">
                  Discord
                </h3>
                {linked ? (
                  <Badge
                    variant="outline"
                    className="border-success/30 bg-success/10 text-success"
                  >
                    <CircleCheck aria-hidden />
                    Discord connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not connected
                  </Badge>
                )}
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                A connected Discord account is mentioned in report and feedback
                posts.
              </p>
            </div>
          </div>

          <div ref={actionRef} className="sm:shrink-0">
            {linked ? (
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
                    {isDisconnecting ? (
                      <Loader2
                        aria-hidden
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : null}
                    Disconnect Discord
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Discord?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Report and feedback posts will stop mentioning you. You
                      can connect Discord again at any time.
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
                {isConnecting ? (
                  <Loader2
                    aria-hidden
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : null}
                Connect Discord
              </Button>
            )}
          </div>
        </li>
      </ul>
    </section>
  );
}
