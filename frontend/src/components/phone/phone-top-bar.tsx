import type { Ref } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneTopBarProps {
  /** Where the back link returns to. */
  href: string;
  /** The name of the screen it returns to; the link's whole accessible name. */
  label: string;
  /** The right-hand slot a screen fills through `PhoneTopBarEnd` (the shell passes it). */
  endRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function PhoneTopBar({
  href,
  label,
  endRef,
  className,
}: PhoneTopBarProps) {
  return (
    <header
      data-slot="phone-top-bar"
      className={cn("ph-app ph-top", className)}
    >
      <Link href={href} className="ph-back">
        <ChevronLeft size={24} aria-hidden="true" />
        {label}
      </Link>
      <div
        ref={endRef}
        data-slot="phone-top-bar-end"
        className="flex min-w-0 items-center gap-2 empty:hidden"
      />
    </header>
  );
}
