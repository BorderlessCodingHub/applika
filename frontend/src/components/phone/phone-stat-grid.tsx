import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PhoneStatGrid({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      data-slot="phone-stat-grid"
      className={cn("ph-dl", className)}
      {...props}
    />
  );
}

export interface PhoneStatProps {
  term: ReactNode;
  mono?: boolean;
  /** Spans both columns (Profile's LinkedIn cell). */
  wide?: boolean;
  /** Board-local value sizes, e.g. Admin's `text-[22px]`. */
  valueClassName?: string;
  children: ReactNode;
}

export function PhoneStat({
  term,
  mono = false,
  wide = false,
  valueClassName,
  children,
}: PhoneStatProps) {
  return (
    <div className={cn(wide && "col-span-2")}>
      <dt>{term}</dt>
      <dd className={cn(mono && "ph-mono", valueClassName)}>{children}</dd>
    </div>
  );
}
