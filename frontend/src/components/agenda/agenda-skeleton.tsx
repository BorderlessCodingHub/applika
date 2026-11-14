"use client";

import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function AgendaItemCardSkeleton() {
  return (
    <div className="@container/agenda-card rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-col gap-2 p-4 @lg/agenda-card:flex-row @lg/agenda-card:gap-4 @lg/agenda-card:p-5">
        <div className="flex items-center gap-2 pt-1 @lg/agenda-card:w-16 @lg/agenda-card:shrink-0 @lg/agenda-card:flex-col @lg/agenda-card:items-start @lg/agenda-card:gap-1.5">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3.5 w-10" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-4">
            <Skeleton className="hidden size-12 shrink-0 rounded-lg @lg/agenda-card:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-32 max-w-full" />
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-6 w-44 rounded-full @3xl/agenda-card:block" />
            <Skeleton className="hidden size-8 shrink-0 @3xl/agenda-card:block" />
            <Skeleton className="size-8 shrink-0" />
          </div>
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function AgendaSkeleton({ className }: { className?: string }) {
  const t = useTranslations("agenda");
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("flex flex-col gap-6", className)}
    >
      <span className="sr-only">{t("page.loading")}</span>
      {[0, 1].map((group) => (
        <div key={group} aria-hidden className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          {[0, 1].map((card) => (
            <AgendaItemCardSkeleton key={card} />
          ))}
        </div>
      ))}
    </div>
  );
}
