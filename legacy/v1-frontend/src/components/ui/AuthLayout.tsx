"use client"

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { appConfig } from "@/domain/constants/appConfig";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black px-4 sm:px-6 md:px-12">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-2xl p-8 md:p-12 md:rounded-3xl md:backdrop-blur-xl md:shadow-xl flex flex-col items-center"
      >
        <div className="text-center mb-8">
          <motion.img
            src={appConfig.logo}
            alt={`${appConfig.name} Logo`}
            className="w-36 sm:w-40 md:w-48 mx-auto"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {title}
          </motion.h2>
          {subtitle && (
            <motion.p
              className="text-white/70 mt-2 text-sm sm:text-base md:text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {children}
      </motion.div>
    </div>
  );
}
