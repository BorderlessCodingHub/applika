"use client";
import Link from "next/link";
import Image from "next/image";
import NavLink from "./NavLink";
const navItems = [
  { href: "/", label: "Home" },
  { href: "/applications", label: "Applications" },
  // { href: "/profile", label: "Profile" },
  // Profile page intentionally disabled for v1 release.
  // Reason: the user management and settings feature set is scheduled for a later milestone (v2+).
  // Keeping the route commented to preserve code structure and maintain future extensibility.
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-white/5 border-b border-white/20">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/images/app-logo.webp"
            alt="Job Tracker Logo"
            width={140}
            height={40}
            priority
          />
        </Link>

        {/* Nav Links */}
        <nav>
          <ul className="flex gap-6">
            {navItems.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
