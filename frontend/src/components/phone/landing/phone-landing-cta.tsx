"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/contexts/auth-context";

/**
 * v2/Landing's floating action, below md on `/` and `/cli`: "Sign in with
 * Borderless" to `/login`, or "Go to Dashboard" once signed in. Mount it as
 * the last child of the page's `flex-col` root: it sticks to the bottom and
 * takes its own room after the footer, so nothing ends under it.
 */
export function PhoneLandingCta() {
  const tLanding = useTranslations("landing");
  const tSignIn = useTranslations("auth.signIn");
  const { isAuthenticated, isLoading } = useAuth();
  const signedIn = !isLoading && isAuthenticated;

  return (
    <div data-slot="landing-phone-cta" className="ph-landing-cta">
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="ph-landing-cta-btn"
      >
        {signedIn ? tLanding("goToDashboard") : tSignIn("signInWithBorderless")}
      </Link>
    </div>
  );
}
