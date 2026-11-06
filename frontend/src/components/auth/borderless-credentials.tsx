"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The sign-in form and the confirm-membership form share this shape. */
export interface BorderlessCredentialsValues {
  email: string;
  password: string;
}

export const EMPTY_BORDERLESS_CREDENTIALS: BorderlessCredentialsValues = {
  email: "",
  password: "",
};

export interface BorderlessCredentialFieldsProps {
  form: UseFormReturn<BorderlessCredentialsValues>;
  autoFocus?: "email" | "password";
}

/** Email + password, named for password managers (`username`, `current-password`). */
export function BorderlessCredentialFields({
  form,
  autoFocus,
}: BorderlessCredentialFieldsProps) {
  const t = useTranslations("auth.credentials");
  return (
    <>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("emailLabel")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={autoFocus === "email"}
                className="h-10"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("passwordLabel")}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="password"
                autoComplete="current-password"
                autoFocus={autoFocus === "password"}
                className="h-10"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

export interface BorderlessFormErrorProps {
  /** The server's `detail`, verbatim. */
  message?: string | null;
  /** An optional second line telling the user what to do next. */
  hint?: string | null;
  slot: string;
  className?: string;
}

/**
 * Always mounted, so a refusal is announced the moment its words land.
 * Clear `message` when a new submit starts, or the same words are not re-read.
 */
export function BorderlessFormError({
  message = null,
  hint = null,
  slot,
  className,
}: BorderlessFormErrorProps) {
  return (
    <div
      role="alert"
      data-slot={slot}
      className={cn("[&:not(:empty)]:mt-4", className)}
    >
      {message ? (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          <CircleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium break-words">{message}</p>
            {hint ? <p className="text-foreground/80">{hint}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface PendingSubmitButtonProps extends Omit<ButtonProps, "type"> {
  pending?: boolean;
  children: ReactNode;
}

/** `aria-disabled` while pending, so a keyboard user's focus stays on it; guard the submit too. */
export function PendingSubmitButton({
  pending = false,
  children,
  className,
  ...props
}: PendingSubmitButtonProps) {
  return (
    <Button
      type="submit"
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      className={cn("aria-disabled:opacity-70", className)}
      {...props}
    >
      {pending ? (
        <LoaderCircle
          aria-hidden
          data-icon="inline-start"
          className="motion-safe:animate-spin"
        />
      ) : null}
      {children}
    </Button>
  );
}
