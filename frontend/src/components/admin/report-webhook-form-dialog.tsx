"use client";

import { useId, useRef } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";
import type { UseFormReturn } from "react-hook-form";

import type { ReportWebhookRow } from "@/components/admin/report-webhook-list";
import {
  MEMBERSHIP_BADGE_KEYS,
  MEMBERSHIP_BADGE_LABEL,
  type MembershipBadgeKey,
} from "@/components/badges/membership-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * `badges` is empty until one is picked (a new row, or a carried-over row
 * with none), and always kept in `MEMBERSHIP_BADGE_KEYS` order.
 */
export interface ReportWebhookFormValues {
  webhook_url: string;
  badges: MembershipBadgeKey[];
  label: string;
}

export const EMPTY_REPORT_WEBHOOK_FORM: ReportWebhookFormValues = {
  webhook_url: "",
  badges: [],
  label: "",
};

/** The set with `key` turned on or off, in `MEMBERSHIP_BADGE_KEYS` order. */
export function toggleBadge(
  badges: readonly MembershipBadgeKey[],
  key: MembershipBadgeKey,
  on: boolean,
): MembershipBadgeKey[] {
  return MEMBERSHIP_BADGE_KEYS.filter((k) =>
    k === key ? on : badges.includes(k),
  );
}

export function reportWebhookToFormValues(
  row: Pick<ReportWebhookRow, "badges" | "label">,
): ReportWebhookFormValues {
  // The stored URL is a secret: the edit form starts blank, never pre-filled.
  return {
    webhook_url: "",
    badges: MEMBERSHIP_BADGE_KEYS.filter((k) => row.badges.includes(k)),
    label: row.label ?? "",
  };
}

export type ReportWebhookFormMode = "add" | "edit";

const COPY: Readonly<
  Record<
    ReportWebhookFormMode,
    Readonly<{
      title: string;
      description: string;
      submit: string;
      urlPlaceholder: string;
    }>
  >
> = {
  add: liveCopy("admin.webhooks.form.add", [
    "title",
    "description",
    "submit",
    "urlPlaceholder",
  ]),
  edit: liveCopy("admin.webhooks.form.edit", [
    "title",
    "description",
    "submit",
    "urlPlaceholder",
  ]),
};

/**
 * The dialog's words, in the active language (`admin.webhooks.form.*`); the
 * dialog calls `useLocale`, so a switch re-renders them. Never spread it.
 */
export const REPORT_WEBHOOK_FORM_COPY = Object.assign(
  liveCopy("admin.webhooks.form", [
    "urlLabel",
    "urlHelp",
    "urlCurrent",
    "badgeLabel",
    "badgeHelp",
    "labelLabel",
    "labelPlaceholder",
    "labelHelp",
    "cancel",
  ]),
  {
    badgeHint: liveCopy("admin.webhooks.form.badgeHint", [
      "borderless_base",
      "borderless_psp",
    ]) satisfies Record<MembershipBadgeKey, string>,
  },
);

export interface ReportWebhookFormDialogProps {
  mode: ReportWebhookFormMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ReportWebhookFormValues>;
  onSubmit: (values: ReportWebhookFormValues) => void;
  isPending?: boolean;
  /** The API's single `detail` string for a 404, 409 or 422. */
  serverError?: string | null;
  /** Edit only: the stored URL's masked form. */
  currentUrlMasked?: string | null;
}

export function ReportWebhookFormDialog({
  mode,
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending = false,
  serverError = null,
  currentUrlMasked = null,
}: ReportWebhookFormDialogProps) {
  // Subscribes: the copy getters read the active language at render.
  useLocale();
  const copy = COPY[mode];
  const openerRef = useRef<HTMLElement | null>(null);
  const badgeLabelId = useId();
  const optionId = useId();

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
            data-slot="report-webhook-form"
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
                    <FormLabel>{REPORT_WEBHOOK_FORM_COPY.urlLabel}</FormLabel>
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
                          {REPORT_WEBHOOK_FORM_COPY.urlCurrent}{" "}
                          <code
                            data-slot="report-webhook-url-current"
                            className="font-mono text-xs break-all text-foreground/80"
                          >
                            {currentUrlMasked}
                          </code>
                        </>
                      ) : (
                        REPORT_WEBHOOK_FORM_COPY.urlHelp
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="badges"
                render={({ field, fieldState }) => (
                  <FormItem>
                    {/* A group is not labelable: it takes its name from this line. */}
                    <span
                      id={badgeLabelId}
                      data-slot="form-label"
                      className={cn(
                        "text-sm leading-none font-medium select-none",
                        fieldState.error && "text-destructive",
                      )}
                    >
                      {REPORT_WEBHOOK_FORM_COPY.badgeLabel}
                    </span>
                    <FormControl>
                      <div
                        role="group"
                        aria-labelledby={badgeLabelId}
                        data-slot="report-webhook-badge-options"
                        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                      >
                        {MEMBERSHIP_BADGE_KEYS.map((key) => (
                          <label
                            key={key}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-muted",
                              fieldState.error && "border-destructive/60",
                            )}
                          >
                            <Checkbox
                              value={key}
                              checked={field.value.includes(key)}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  toggleBadge(
                                    field.value,
                                    key,
                                    checked === true,
                                  ),
                                )
                              }
                              onBlur={field.onBlur}
                              aria-invalid={!!fieldState.error || undefined}
                              aria-labelledby={`${optionId}-${key}-name`}
                              aria-describedby={`${optionId}-${key}-hint`}
                              className="mt-0.5"
                            />
                            <span className="flex min-w-0 flex-col gap-1">
                              <span
                                id={`${optionId}-${key}-name`}
                                className="font-display text-sm leading-none font-semibold tracking-wide-label text-foreground"
                              >
                                {MEMBERSHIP_BADGE_LABEL[key]}
                              </span>
                              <span
                                id={`${optionId}-${key}-hint`}
                                className="text-xs text-foreground/70"
                              >
                                {REPORT_WEBHOOK_FORM_COPY.badgeHint[key]}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </FormControl>
                    <FormDescription>
                      {REPORT_WEBHOOK_FORM_COPY.badgeHelp}
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
                    <FormLabel>{REPORT_WEBHOOK_FORM_COPY.labelLabel}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        placeholder={REPORT_WEBHOOK_FORM_COPY.labelPlaceholder}
                      />
                    </FormControl>
                    <FormDescription>
                      {REPORT_WEBHOOK_FORM_COPY.labelHelp}
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
                  data-slot="report-webhook-form-error"
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
                  {REPORT_WEBHOOK_FORM_COPY.cancel}
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
