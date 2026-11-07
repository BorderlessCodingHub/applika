"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { APP_CONFIG } from "@/config";
import { useAuth } from "@/contexts/auth-context";
import { consumeReturnTo } from "@/lib/return-to";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * Where a signed-in visit to `/login` goes: a new account answers the
 * one-time `/welcome` choice first (the return-to path waits for it);
 * otherwise the stored return-to path, else the dashboard.
 */
export function signedInLandingFor(
  user: Pick<User, "github_restore"> | null,
): string {
  if (user?.github_restore?.prompt) return "/welcome";
  return consumeReturnTo() ?? "/dashboard";
}

/**
 * `/login` (ADR-0026): one "Sign in with Borderless" button. The browser
 * leaves for `GET /auth/borderless/login`, Borderless's own sign-in page,
 * and the API's callback brings it back here: signed in (the cookies are
 * set, this page moves on) or with `?error=<code>` (`&cli=1` when the
 * attempt came from `applika login`). No password, code or token is ever
 * handled here.
 */
export function LoginPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const cli = searchParams.get("cli") === "1";
  const [pending, setPending] = useState(false);
  // The landing consumes the return-to path: navigate once.
  const redirected = useRef(false);

  // Back from Borderless can restore this page from the bfcache with the
  // button still pending: start idle again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // A refused CLI sign-in stays on screen even with a browser session: the
  // words are about the terminal.
  const redirects = !cli && !isLoading && isAuthenticated;

  useEffect(() => {
    if (!redirects || redirected.current) return;
    redirected.current = true;
    router.replace(signedInLandingFor(user));
  }, [redirects, router, user]);

  if (redirects) {
    return null;
  }

  return (
    <SignInScreen
      onSignIn={() => {
        setPending(true);
        window.location.assign(services.auth.borderlessLoginUrl());
      }}
      pending={pending}
      errorCode={errorCode}
      cli={cli}
      createAccountHref={APP_CONFIG.borderless.signUpUrl}
    />
  );
}
