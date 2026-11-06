"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { BadgeAlert } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  BorderlessCredentialFields,
  BorderlessFormError,
  PendingSubmitButton,
  type BorderlessCredentialsValues,
} from "@/components/auth/borderless-credentials";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { borderlessCredentialsSchema } from "@/lib/borderless-credentials-schema";
import { borderlessErrorWords } from "@/lib/borderless-error";
import { cn } from "@/lib/utils";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

import {
  MEMBERSHIP_BADGE_LABEL,
  membershipAccess,
  type MembershipBadgeKey,
} from "./membership-badge";

export const CONFIRM_MEMBERSHIP_COPY = {
  title: "Sign in again to confirm your membership",
  body: "Enter your Borderless password so applika can read your membership again. You stay signed in.",
  submit: "Confirm membership",
} as const;

/** `borderless.status` values that are not `active`. */
export type UnconfirmedStatus = "expired" | "needs_reconnect";

/** Why the membership needs confirming, in one sentence; `null` when the status says nothing. */
export function confirmMembershipReason(
  status: string | null | undefined,
  badge?: MembershipBadgeKey | null,
): string | null {
  const paused = badge
    ? `, so your ${MEMBERSHIP_BADGE_LABEL[badge]} badge is paused`
    : "";
  if (status === "expired") return `Your Borderless access expired${paused}.`;
  if (status === "needs_reconnect") {
    return badge
      ? `Borderless did not accept applika's last check${paused}.`
      : "Borderless did not accept applika's last check of your membership.";
  }
  return null;
}

const TITLE_CLASS = {
  h1: "font-display text-xl font-bold tracking-tight-display sm:text-2xl",
  h2: "font-display text-base font-semibold",
  h3: "text-sm font-semibold",
} as const;

// The form lines up under the title: tile width + the 12px gap.
const TILE_CLASS = {
  h1: { tile: "size-10 rounded-lg [&>svg]:size-5", indent: "sm:pl-13" },
  h2: { tile: "size-8 rounded-md [&>svg]:size-4", indent: "sm:pl-11" },
  h3: { tile: "size-8 rounded-md [&>svg]:size-4", indent: "sm:pl-11" },
} as const;

export interface ConfirmMembershipFormViewProps {
  form: UseFormReturn<BorderlessCredentialsValues>;
  /** Called only while not pending. */
  onSubmit: (values: BorderlessCredentialsValues) => void;
  pending?: boolean;
  /** The server's `detail`, verbatim (401, 403, 409, 429, 503). */
  error?: string | null;
  /** `borderless.status`; picks the reason line. */
  status?: string | null;
  /** The recorded badge the reason line names, if any. */
  badge?: MembershipBadgeKey | null;
  /** `h1` on the Reports gate, `h2` on the profile. */
  titleAs?: keyof typeof TITLE_CLASS;
  autoFocusPassword?: boolean;
  className?: string;
}

/** Frameless: the profile notice and the Reports gate each give it a card. */
export function ConfirmMembershipFormView({
  form,
  onSubmit,
  pending = false,
  error = null,
  status = null,
  badge = null,
  titleAs: Title = "h2",
  autoFocusPassword = false,
  className,
}: ConfirmMembershipFormViewProps) {
  const titleId = useId();
  const reason = confirmMembershipReason(status, badge);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    void form.handleSubmit(onSubmit)(event);
  };

  return (
    <div
      data-slot="confirm-membership"
      data-status={status ?? undefined}
      className={cn("flex flex-col", className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center bg-warning/10 text-warning",
            TILE_CLASS[Title].tile,
          )}
        >
          <BadgeAlert />
        </span>
        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <Title
            id={titleId}
            className={cn("text-balance text-foreground", TITLE_CLASS[Title])}
          >
            {CONFIRM_MEMBERSHIP_COPY.title}
          </Title>
          {reason ? (
            <p
              data-slot="confirm-membership-reason"
              className="text-sm text-pretty text-foreground"
            >
              {reason}
            </p>
          ) : null}
          <p className="text-sm text-pretty text-foreground/70">
            {CONFIRM_MEMBERSHIP_COPY.body}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form
          noValidate
          aria-labelledby={titleId}
          data-slot="confirm-membership-form"
          onSubmit={submit}
          className={cn(
            "mt-5 flex w-full max-w-md flex-col",
            TILE_CLASS[Title].indent,
          )}
        >
          <div className="flex flex-col gap-4">
            <BorderlessCredentialFields
              form={form}
              autoFocus={autoFocusPassword ? "password" : undefined}
            />
          </div>
          <BorderlessFormError
            slot="confirm-membership-error"
            message={error}
          />
          <PendingSubmitButton
            pending={pending}
            className="mt-5 w-full sm:w-auto sm:self-start"
          >
            {CONFIRM_MEMBERSHIP_COPY.submit}
          </PendingSubmitButton>
        </form>
      </Form>
    </div>
  );
}

export interface ConfirmMembershipMenuItemProps {
  /** The menu's own close/navigate callback (`UserMenu` `onNavigate`). */
  onSelect?: () => void;
  href?: string;
}

/** Account-menu prompt for a recorded badge that does not count; the Reports page holds the form. */
export function ConfirmMembershipMenuItem({
  onSelect,
  href = "/reports",
}: ConfirmMembershipMenuItemProps) {
  return (
    <DropdownMenuItem asChild onSelect={onSelect}>
      <Link
        href={href}
        data-slot="confirm-membership-menu-item"
        className="cursor-pointer items-start gap-2"
      >
        <BadgeAlert aria-hidden className="mt-0.5 text-warning" />
        <span className="min-w-0 text-pretty">
          {CONFIRM_MEMBERSHIP_COPY.title}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export interface ConfirmMembershipFormProps {
  /** The signed-in user: its Borderless email prefills the form, its status and badge pick the reason. */
  user: Pick<User, "badges" | "borderless">;
  titleAs?: ConfirmMembershipFormViewProps["titleAs"];
  autoFocusPassword?: boolean;
  /** After the user and report queries are refetched. */
  onConfirmed?: () => void;
  className?: string;
}

/**
 * The wired confirm form: `POST /auth/borderless/confirm` with the Borderless
 * password renews the access and reads the membership again; the applika
 * session is kept. The user and report queries are refetched before the
 * button stops pending, so the caller's gate flips straight to the reports.
 */
export function ConfirmMembershipForm({
  user,
  titleAs,
  autoFocusPassword,
  onConfirmed,
  className,
}: ConfirmMembershipFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<BorderlessCredentialsValues>({
    resolver: zodResolver(borderlessCredentialsSchema),
    defaultValues: {
      email: user.borderless?.email ?? "",
      password: "",
    },
  });

  const confirm = useMutation({
    mutationFn: (values: BorderlessCredentialsValues) =>
      services.auth.confirmMembership(values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["report"] }),
      ]);
      toast.success("Membership confirmed");
      onConfirmed?.();
    },
    onError: (err) => {
      const words = borderlessErrorWords(err);
      setError(words.message);
      if (words.status === 401) {
        form.resetField("password");
        form.setFocus("password");
      }
    },
  });

  return (
    <ConfirmMembershipFormView
      form={form}
      onSubmit={(values) => {
        setError(null);
        confirm.mutate(values);
      }}
      pending={confirm.isPending}
      error={error}
      status={user.borderless?.status ?? null}
      badge={membershipAccess(user).badges[0] ?? null}
      titleAs={titleAs}
      autoFocusPassword={autoFocusPassword}
      className={className}
    />
  );
}
