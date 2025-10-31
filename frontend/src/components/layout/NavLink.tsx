"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  label: string;
  icon?: React.ElementType;
}

export default function NavLink({ href, label, icon: Icon }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
      <Link
        href={href}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-300
          ${
            active
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
              : "text-white/80 hover:text-white hover:bg-white/10"
          }`}
      >
        {Icon && <Icon size={18} />}
        {label}
      </Link>
    </motion.div>
  );
}
