"use client";

import { useRef } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import type { DiscordWebhookRow } from "@/components/admin/discord-webhook-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Every field is a string; `role_ids` is the raw textarea text. */
export interface DiscordWebhookFormValues {
  webhook_url: string;
  guild_id: string;
  role_ids: string;
  label: string;
}

export const EMPTY_DISCORD_WEBHOOK_FORM: DiscordWebhookFormValues = {
  webhook_url: "",
  guild_id: "",
  role_ids: "",
  label: "",
};

export function discordWebhookToFormValues(
  row: Pick<DiscordWebhookRow, "guild_id" | "role_ids" | "label">,
): DiscordWebhookFormValues {
  // The stored URL is a secret: the edit form starts blank, never pre-filled.
  return {
    webhook_url: "",
    guild_id: row.guild_id,
    role_ids: row.role_ids.join("\n"),
    label: row.label ?? "",
  };
}

export type DiscordWebhookFormMode = "add" | "edit";

const COPY: Record<
  DiscordWebhookFormMode,
  {
    title: string;
    description: string;
    submit: string;
    urlPlaceholder: string;
  }
> = {
  add: {
    title: "Add webhook",
    description:
      "Reports from members of this server are posted through this webhook.",
    submit: "Save webhook",
    urlPlaceholder: "https://discord.com/api/webhooks/…",
  },
  edit: {
    title: "Edit webhook",
    description: "Only the fields you change are saved.",
    submit: "Save changes",
    urlPlaceholder: "Leave blank to keep the current URL",
  },
};

export interface DiscordWebhookFormDialogProps {
  mode: DiscordWebhookFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<DiscordWebhookFormValues>;
  onSubmit: (values: DiscordWebhookFormValues) => void;
  isPending?: boolean;
  /** The API's single `detail` string for a 409 or 422. */
  serverError?: string | null;
  /** Edit only: the stored URL's masked form. */
  currentUrlMasked?: string | null;
}

export function DiscordWebhookFormDialog({
  mode,
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending = false,
  serverError = null,
  currentUrlMasked = null,
}: DiscordWebhookFormDialogProps) {
  const copy = COPY[mode];
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-4 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-y-0 flex-col gap-0 p-0 sm:top-[8dvh] sm:max-h-[84dvh]"
        // Opened without a DialogTrigger, so Radix has nothing to return focus to.
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          openerRef.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : null;
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            noValidate
            data-slot="discord-webhook-form"
            data-mode={mode}
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pt-1 pb-5">
              <FormField
                control={form.control}
                name="webhook_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Webhook URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder={copy.urlPlaceholder}
                      />
                    </FormControl>
                    <FormDescription>
                      {mode === "edit" && currentUrlMasked ? (
                        <>
                          Current:{" "}
                          <code className="font-mono text-xs break-all text-foreground/80">
                            {currentUrlMasked}
                          </code>
                        </>
                      ) : (
                        "In Discord: channel settings, Integrations, Webhooks, Copy Webhook URL. Only a masked form is shown after saving."
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="guild_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server id</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        className="font-numeric"
                      />
                    </FormControl>
                    <FormDescription>
                      17 to 20 digits. In Discord, with Developer Mode on,
                      right-click the server and pick Copy Server ID.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role ids</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="One per line, or separated by commas or spaces"
                        className="max-h-40 font-numeric"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Comma, space or newline separated, up to 25. A
                      member needs one of these roles; leave empty to allow any
                      member.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder="e.g. Reports, main server"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Up to 100 characters, to tell webhooks apart.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* In the fixed band, so the server's answer is beside Save however far the body scrolled. */}
            <div className="flex flex-col gap-3 border-t px-6 py-4">
              {serverError ? (
                <div
                  role="alert"
                  data-slot="discord-webhook-form-error"
                  className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
                >
                  <CircleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <p className="min-w-0 font-medium">{serverError}</p>
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  aria-busy={isPending || undefined}
                >
                  {isPending ? (
                    <Loader2
                      aria-hidden
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  {copy.submit}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
