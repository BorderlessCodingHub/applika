"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
}

export default function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-md font-medium transition-all duration-300
        ${active
          ? "bg-violet-700 text-white border border-violet-700"
          : "text-white hover:text-emerald-400 hover:-translate-y-0.5"
        }`}
    >
      {label}
    </Link>
  );
}
