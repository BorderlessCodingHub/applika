"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Github } from "lucide-react";
import { appConfig } from "@/lib/constants";

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="border-t border-white/10 bg-black/40 backdrop-blur-md mt-auto py-6"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-6">
        <motion.p
          whileHover={{ scale: 1.05 }}
          className="text-white/70 text-sm text-center sm:text-left"  
        >
          {`
            © ${new Date().getFullYear()} ${appConfig.shortName} — Built for
            developers, inspired by excellence.
            `}
        </motion.p>

        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Link
            href={appConfig.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/80 hover:text-emerald-400 transition-all duration-300"
          >
            <Github size={18} />
            <span className="text-sm font-medium">View on GitHub</span>
          </Link>
        </motion.div>
      </div>
    </motion.footer>
  );
}
