"use client";
import {useCallback} from "react";
import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";

export default function AuthGitHubButton() {
  const handleLogin = useCallback(() => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/github/login`;
  }, []);

  return (
    <motion.button
      onClick={handleLogin}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.2 }}
      aria-label="Sign in with GitHub"
      className="flex items-center justify-center gap-2 w-full py-4 rounded-lg
                 bg-white hover:bg-gray-100 text-black font-semibold transition-colors
                 border border-black/20 text-center text-lg sm:text-xl md:text-2xl"
    >
      <FaGithub size={24} />
      Sign in with GitHub
    </motion.button>
  );
}
