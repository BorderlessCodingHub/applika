"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ModalBaseProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "default" | "danger";
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, delay: 0.05 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, delay: 0.1 },
  },
};

const modalVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.35,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export default function ModalBase({
  isOpen,
  title,
  onClose,
  children,
  variant = "default",
}: ModalBaseProps) {
  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            key="modal"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`relative w-[90%] max-w-3xl rounded-2xl p-8 shadow-2xl border ${
              variant === "danger"
                ? "bg-red-950/60 border-red-800/50"
                : "bg-white/5 border-white/20 backdrop-blur-xl"
            }`}
          >
            <div className="flex justify-between items-center border-b border-white/20 pb-4 mb-4">
              <h3 className="text-white text-lg font-semibold">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close Modal"
              >
                <X size={20} />
              </button>
            </div>

            <div>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
