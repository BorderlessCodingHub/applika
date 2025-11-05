"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase } from "lucide-react";
import { appConfig } from "@/domain/constants/appConfig";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: Briefcase },
  // { href: "/profile", label: "Profile" },
  // Profile page intentionally disabled for v1 release.
  // Reason: the user management and settings feature set is scheduled for a later milestone (v2+).
  // Keeping the route commented to preserve code structure and maintain future extensibility.
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 backdrop-blur-xl bg-gradient-to-b from-black/40 to-black/20 border-b border-white/10 shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
        {/* Logo */}
        <motion.div whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={appConfig.logo}
              alt={`${appConfig.name} Logo`}
              width={150}
              height={40}
              priority
              className="rounded-lg"
            />
          </Link>
        </motion.div>

        {/* Nav Links */}
        <nav>
          <ul className="flex gap-4 sm:gap-8">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <motion.li
                  key={href}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    href={href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-300
                      ${
                        active
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                          : "text-white/80 hover:text-white hover:bg-white/10"
                      }`}
                  >
                    <Icon size={18} />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </nav>
      </div>
    </motion.header>
  );
}
