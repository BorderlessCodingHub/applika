"use client";

import { useTranslations } from "next-intl";

import { LinkButton } from "@/components/ui/button";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/** The page's words (`notFound.*`), in the active language. */
export const NOT_FOUND_COPY = liveCopy("notFound", ["code", "title", "home"]);

// Subtitle is `foreground/70`: `muted-foreground` on `bg-muted` is under 4.5:1 in light.
const VARIANT_CLASS = {
  page: { root: "px-4", code: "text-6xl", title: "text-xl" },
  shell: { root: "py-16 md:py-24", code: "text-5xl", title: "text-lg" },
} as const;

export interface NotFoundMessageProps {
  /** `page` fills `app/not-found.tsx`'s viewport wrapper; `shell` sits in the app content column. */
  variant?: keyof typeof VARIANT_CLASS;
  className?: string;
}

/** The app's "page not found": a gated route answers with it too, so it never tells the feature exists. */
export function NotFoundMessage({
  variant = "page",
  className,
}: NotFoundMessageProps) {
  const t = useTranslations("notFound");
  const sizes = VARIANT_CLASS[variant];

  return (
    <div
      data-slot="not-found"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center text-center",
        sizes.root,
        className,
      )}
    >
      <h1
        className={cn(
          "font-numeric font-semibold tracking-tight text-foreground",
          sizes.code,
        )}
      >
        {t("code")}
      </h1>
      <p className={cn("mt-3 text-pretty text-foreground/70", sizes.title)}>
        {t("title")}
      </p>
      <LinkButton href="/" variant="outline" className="mt-6">
        {t("home")}
      </LinkButton>
    </div>
  );
}
