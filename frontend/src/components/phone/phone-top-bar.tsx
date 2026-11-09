import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneTopBarProps {
  /** Where the back link returns to. */
  href: string;
  /** The name of the screen it returns to; the link's whole accessible name. */
  label: string;
  className?: string;
}

export function PhoneTopBar({ href, label, className }: PhoneTopBarProps) {
  return (
    <header
      data-slot="phone-top-bar"
      className={cn("ph-app ph-top", className)}
    >
      <Link href={href} className="ph-back">
        <ChevronLeft size={24} aria-hidden="true" />
        {label}
      </Link>
    </header>
  );
}
