import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { DEVICE_SIGN_IN_COPY } from "./device-sign-in-copy";

export function DeviceSignInLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="device-sign-in"
      className={cn("mx-auto flex w-full max-w-xl flex-col gap-6", className)}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground sm:text-3xl">
          {DEVICE_SIGN_IN_COPY.title}
        </h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {DEVICE_SIGN_IN_COPY.lead}
        </p>
      </div>
      {children}
    </div>
  );
}
