"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  EMPTY_BORDERLESS_CREDENTIALS,
  type BorderlessCredentialsValues,
} from "@/components/auth/borderless-credentials";
import { SIGN_IN_COPY, SignInScreen } from "@/components/auth/sign-in-screen";
import { APP_CONFIG } from "@/config";
import { useAuth } from "@/contexts/auth-context";
import { borderlessCredentialsSchema } from "@/lib/borderless-credentials-schema";
import { borderlessErrorWords } from "@/lib/borderless-error";
import { word } from "@/i18n/translator";
import { consumeReturnTo } from "@/lib/return-to";
import { services } from "@/services/services";
import type { BorderlessSignInResult } from "@/services/types/auth";

/**
 * Where a web sign-in lands: a new account goes to `/welcome` first (the
 * return-to path waits for its choice); otherwise the stored return-to path,
 * else the dashboard.
 */
export function webLandingFor(result: BorderlessSignInResult): string {
  if (result.new_account) return "/welcome";
  return consumeReturnTo() ?? "/dashboard";
}

/**
 * `?cli=1`, but the API answered a web sign-in: the terminal's marker had
 * lapsed. Read at the moment it is shown, in the active language.
 */
export function cliHandoffLostMessage(): string {
  return word("auth.signIn.cliHandoffLost");
}

interface SignInError {
  message: string;
  hint: string | null;
}

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `applika login` opens `/login?cli=1`: the password is always asked, even
  // with a browser session, and the answer hands the sign-in to the terminal.
  const cli = searchParams.get("cli") === "1";
  const [error, setError] = useState<SignInError | null>(null);
  const [cliHandoffLost, setCliHandoffLost] = useState(false);

  const form = useForm<BorderlessCredentialsValues>({
    resolver: zodResolver(borderlessCredentialsSchema),
    defaultValues: EMPTY_BORDERLESS_CREDENTIALS,
  });

  const signIn = useMutation({
    mutationFn: (values: BorderlessCredentialsValues) =>
      services.auth.borderlessSignIn(values),
    onSuccess: (result) => {
      // The terminal's sign-in marker lapsed (it lives a few minutes): the
      // API signed this browser in instead and has nothing to hand back. Say
      // so here; the terminal is still waiting and must start again.
      if (cli && !result.redirect_to) {
        setCliHandoffLost(true);
        setError({
          message: cliHandoffLostMessage(),
          hint: SIGN_IN_COPY.cliExpiredHint,
        });
        return;
      }
      // A full navigation either way: the CLI hand-off leaves applika, and a
      // web sign-in may replace another account's session in this tab, so
      // nothing cached for it may survive.
      window.location.assign(result.redirect_to ?? webLandingFor(result));
    },
    onError: (err) => {
      const words = borderlessErrorWords(err);
      setError({
        message: words.message,
        hint: words.cliLoginExpired ? SIGN_IN_COPY.cliExpiredHint : null,
      });
      if (words.status === 401) {
        form.resetField("password");
        form.setFocus("password");
      }
    },
  });

  useEffect(() => {
    if (!cli && !isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [cli, isAuthenticated, isLoading, router]);

  if (!cli && !isLoading && isAuthenticated) {
    return null;
  }

  return (
    <SignInScreen
      form={form}
      mode={cli ? "cli" : "web"}
      onSubmit={(values) => {
        setError(null);
        setCliHandoffLost(false);
        signIn.mutate(values);
      }}
      pending={signIn.isPending || (signIn.isSuccess && !cliHandoffLost)}
      error={error?.message ?? null}
      errorHint={error?.hint ?? null}
      createAccountHref={APP_CONFIG.borderless.signUpUrl}
    />
  );
}
