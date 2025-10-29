"use client";

import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import CardDetailsSkeleton from "@/components/ui/CardDetailsSkeleton";
import { useApplicationSteps } from "@/features/applications/hooks/useApplicationSteps";

interface CardDetailsProps {
  id: number;
  isOpen: boolean;
  finalized?: boolean;
  observation?: string;
  onEditStep: (step: any) => void;
  onDeleteStep: (step: any) => void;
}

export default function CardDetails({
  id,
  isOpen,
  finalized = false,
  observation,
  onEditStep,
  onDeleteStep,
}: CardDetailsProps) {
  const { steps, isLoading, isValidating } = useApplicationSteps(
    isOpen ? id : undefined
  );
  const loading = isLoading || isValidating;

  if (!isOpen) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl transition-all"
    >
      {loading ? (
        <CardDetailsSkeleton />
      ) : steps.length > 0 ? (
        <div className="space-y-4">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex gap-4 items-start"
            >
              <div className="relative w-3 h-3 bg-white/20 rounded-full mt-1.5" />
              <div className="flex-1">
                <div className="font-medium">{step.step_name}</div>
                <div className="text-sm text-white/60">{step.step_date}</div>
                {step.observation && (
                  <div className="mt-1 text-white/80 text-sm bg-white/5 rounded-lg p-2">
                    {step.observation}
                  </div>
                )}
              </div>
              <div className="flex gap-3 items-center">
                <IconButton
                  icon={<Pencil size={16} />}
                  color={
                    finalized
                      ? "text-white/30 cursor-not-allowed"
                      : "text-blue-400"
                  }
                  onClick={() => !finalized && onEditStep(step)}
                />
                <IconButton
                  icon={<Trash2 size={16} />}
                  color={
                    finalized
                      ? "text-white/30 cursor-not-allowed"
                      : "text-red-400"
                  }
                  onClick={() => !finalized && onDeleteStep(step)}
                />
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-white/60 italic text-sm">
          No steps found for this application.
        </div>
      )}

      {observation && !loading && (
        <div className="mt-4 bg-white/5 rounded-xl p-3 text-white/80 text-sm">
          <strong>Observation:</strong> {observation}
        </div>
      )}
    </motion.div>
  );
}

function IconButton({
  icon,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.2, rotate: 8 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 250, damping: 18 }}
      className={`${color} hover:opacity-80`}
      onClick={onClick}
    >
      {icon}
    </motion.button>
  );
}
