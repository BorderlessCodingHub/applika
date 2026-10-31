"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function DeviceSignInLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("device");
  return (
    <div
      data-slot="device-sign-in"
      className={cn("mx-auto flex w-full max-w-xl flex-col gap-6", className)}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {t("lead")}
        </p>
      </div>
      {children}
    </div>
  );
}
