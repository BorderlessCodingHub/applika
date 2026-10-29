"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  WelcomeScreen,
  type WelcomePending,
} from "@/components/auth/welcome-screen";
import { useAuth } from "@/contexts/auth-context";
import {
  useDismissGithubRestore,
  useStartGithubRestore,
} from "@/hooks/use-github-restore";
import { consumeReturnTo } from "@/lib/return-to";

/**
 * The one-time choice a new Borderless account sees: restore an old
 * GitHub-era account, or start fresh. Either answer is stored by the API, so
 * an account that already answered is sent on to the dashboard.
 */
export function WelcomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const restore = useStartGithubRestore();
  const dismiss = useDismissGithubRestore();

  const answering =
    restore.isPending ||
    restore.isSuccess ||
    dismiss.isPending ||
    dismiss.isSuccess;
  const answered = user ? !user.github_restore?.prompt : false;

  useEffect(() => {
    if (answered && !answering) router.replace("/dashboard");
  }, [answered, answering, router]);

  if (answered && !answering) return null;

  const pending: WelcomePending =
    restore.isPending || restore.isSuccess
      ? "restore"
      : dismiss.isPending || dismiss.isSuccess
        ? "start-fresh"
        : null;

  return (
    <WelcomeScreen
      pending={pending}
      onRestore={() => {
        // GitHub's answer lands on /profile with the outcome; a stored
        // return-to would carry the browser away from it.
        consumeReturnTo();
        restore.mutate();
      }}
      onStartFresh={() =>
        dismiss.mutate(undefined, {
          onSuccess: () => router.replace(consumeReturnTo() ?? "/dashboard"),
        })
      }
    />
  );
}
