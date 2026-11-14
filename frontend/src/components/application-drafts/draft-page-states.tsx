"use client";

import { type ReactNode } from "react";
import {
  ArrowLeftIcon,
  FilePenLineIcon,
  FileSearchIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const APPLICATIONS_HREF = "/applications";

export interface DraftPageHeaderProps {
  /** `Senior Engineer · Acme` once known; the default explains the flow. */
  subtitle?: string | null;
  /** `<DraftStepper />`; omit on the loading, 404 and error states. */
  children?: ReactNode;
  /** Beside the h1 (a sibling, never inside): the "Beta" badge while `cvs` is in beta. */
  titleBadge?: ReactNode;
  className?: string;
}

export function DraftPageHeader({
  subtitle,
  children,
  titleBadge,
  className,
}: DraftPageHeaderProps) {
  const t = useTranslations("drafts.page");
  return (
    <header
      data-slot="draft-page-header"
      className={cn("flex flex-col gap-5", className)}
    >
      <div className="flex flex-col gap-2">
        <LinkButton
          href={APPLICATIONS_HREF}
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden data-icon="inline-start" />
          {t("backToApplications")}
        </LinkButton>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground sm:text-3xl">
              {t("pageTitle")}
            </h1>
            {titleBadge}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">
            {subtitle || t("pageSubtitle")}
          </p>
        </div>
      </div>
      {children}
    </header>
  );
}

export function DraftLoading({ className }: { className?: string }) {
  const t = useTranslations("drafts.page");
  return (
    <div
      aria-busy
      aria-label={t("loading")}
      data-slot="draft-loading"
      className={cn("flex flex-col gap-4", className)}
    >
      <Skeleton className="h-9 w-72 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export interface DraftLoadMessageProps {
  /** `not-found` is the 404 from `GET /applications/drafts/{id}`. */
  kind: "not-found" | "error";
  /** The server's detail for `error`. */
  detail?: string | null;
  /** Renders `Try again` on `error`. */
  onRetry?: () => void;
  className?: string;
}

/** The `?id=` draft could not be opened. Announced: something went wrong. */
export function DraftLoadMessage({
  kind,
  detail,
  onRetry,
  className,
}: DraftLoadMessageProps) {
  const t = useTranslations("drafts.page");
  const notFound = kind === "not-found";
  const Icon = notFound ? FileSearchIcon : TriangleAlertIcon;

  return (
    <div
      role="alert"
      data-slot="draft-load-message"
      data-kind={kind}
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mb-3 size-8",
          notFound ? "text-muted-foreground" : "text-destructive",
        )}
      />
      <p className="text-sm font-medium text-foreground">
        {notFound ? t("notFoundTitle") : t("loadErrorTitle")}
      </p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">
        {notFound ? t("notFoundBody") : detail || t("loadErrorBody")}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {!notFound && onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcwIcon aria-hidden data-icon="inline-start" />
            {t("tryAgain")}
          </Button>
        ) : null}
        <LinkButton
          href={APPLICATIONS_HREF}
          variant={notFound ? "default" : "ghost"}
          size="sm"
        >
          {t("goToApplications")}
        </LinkButton>
      </div>
    </div>
  );
}

/** Step 2 when the user has no master CV. The draft is already saved. */
export function DraftNoMasterCv({
  newCvHref = "/cvs/new",
  className,
}: {
  newCvHref?: string;
  className?: string;
}) {
  const t = useTranslations("drafts.page");
  return (
    <div
      data-slot="draft-no-master-cv"
      className={cn(
        "flex flex-col items-center rounded-xl border-2 border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-muted text-primary ring-1 ring-primary/20">
        <FilePenLineIcon aria-hidden className="size-6" />
      </span>
      <h2 className="font-display text-base font-semibold text-foreground">
        {t("noMasterCvTitle")}
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">
        {t("noMasterCvBody")}
      </p>
      <LinkButton href={newCvHref} className="mt-5">
        {t("noMasterCvCta")}
      </LinkButton>
    </div>
  );
}
