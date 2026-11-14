"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { isCompleteUserCode, normalizeUserCode } from "./device-sign-in-copy";

export interface DeviceCodeFormProps {
  /** Controlled; already normalized ("BCDF-GHJK"). */
  code: string;
  onCodeChange: (code: string) => void;
  /** Only called with a complete code. */
  onSubmit: (code: string) => void;
  pending?: boolean;
  /** The verify 404/409 `detail`, verbatim. Clear it in `onCodeChange`. */
  error?: string | null;
  autoFocus?: boolean;
  className?: string;
}

export function DeviceCodeForm({
  code,
  onCodeChange,
  onSubmit,
  pending = false,
  error = null,
  autoFocus = false,
  className,
}: DeviceCodeFormProps) {
  const t = useTranslations("device");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [incomplete, setIncomplete] = useState(false);
  const message = incomplete ? t("incomplete") : error;

  return (
    <form
      noValidate
      data-slot="device-code-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (!isCompleteUserCode(code)) {
          setIncomplete(true);
          inputRef.current?.focus();
          return;
        }
        onSubmit(code);
      }}
      className={cn(
        "flex flex-col rounded-xl bg-card p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <Label htmlFor={inputId}>{t("codeLabel")}</Label>
      <Input
        ref={inputRef}
        id={inputId}
        name="user_code"
        value={code}
        onChange={(event) => {
          setIncomplete(false);
          onCodeChange(normalizeUserCode(event.target.value));
        }}
        autoFocus={autoFocus}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={9}
        placeholder={t("codePlaceholder")}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${hintId} ${errorId}` : hintId}
        className="mt-2 h-14 text-center font-mono text-2xl tracking-widest uppercase md:text-2xl"
      />
      <p id={hintId} className="mt-2 text-xs text-muted-foreground">
        {t("codeHint")}
      </p>
      <p
        id={errorId}
        role="alert"
        data-slot="device-code-error"
        className="text-sm text-destructive [&:not(:empty)]:mt-2"
      >
        {message}
      </p>
      <Button
        type="submit"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        className="mt-5 w-full aria-disabled:opacity-60 sm:w-auto sm:self-end"
      >
        {pending ? (
          <LoaderCircle
            aria-hidden
            data-icon="inline-start"
            className="motion-safe:animate-spin"
          />
        ) : null}
        {t("continue")}
      </Button>
    </form>
  );
}
