import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PhoneChipProps extends Omit<
  ComponentProps<"button">,
  "type" | "aria-pressed"
> {
  /** A toggle chip (sort, filter): `aria-pressed` and the `on` look. Absent, a plain button. */
  pressed?: boolean;
  children: ReactNode;
}

export function PhoneChip({
  pressed,
  className,
  children,
  ...props
}: PhoneChipProps) {
  return (
    <button
      type="button"
      data-slot="phone-chip"
      aria-pressed={pressed}
      className={cn("ph-chip", pressed && "ph-on", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export interface PhoneChipLinkProps {
  href: string;
  /** The section on screen: `aria-current="page"` and the `on` look. */
  current?: boolean;
  className?: string;
  children: ReactNode;
}

export function PhoneChipLink({
  href,
  current = false,
  className,
  children,
}: PhoneChipLinkProps) {
  return (
    <Link
      href={href}
      data-slot="phone-chip"
      aria-current={current ? "page" : undefined}
      className={cn("ph-chip", current && "ph-on", className)}
    >
      {children}
    </Link>
  );
}
