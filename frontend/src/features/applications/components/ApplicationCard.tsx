"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Flag,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import CardDetails from "../CardDetails";
import { Application, Step } from "../types";
import { useApplicationSteps } from "@/features/applications/hooks/useApplicationSteps";

interface ApplicationCardProps {
  app: Application;
  onAddStep: (app: Application) => void;
  onEditStep: (step: Step, app: Application) => void;
  onDeleteStep: (step: Step, app: Application) => void;
  onEditApp: (app: Application) => void;
  onDeleteApp: (app: Application) => void;
  onFinalizeApp: (app: Application) => void;
}

export default function ApplicationCard({
  app,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onEditApp,
  onDeleteApp,
  onFinalizeApp,
}: ApplicationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { steps, isLoading, mutate } = useApplicationSteps(
    isOpen ? app.id : null
  );

  useEffect(() => {
    if (isOpen && app.id) mutate();
  }, [isOpen, app.id, mutate]);

  const toggleDetails = () => setIsOpen((prev) => !prev);

  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.35, ease: "easeInOut" } }}
      className="w-full h-full flex flex-col rounded-2xl p-4 bg-white/5 border border-white/20 backdrop-blur-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 min-h-[45px]">
        <div className="flex flex-col gap-1 min-w-[180px] w-full sm:w-auto  items-center sm:items-start">
          <h3 className="text-white font-semibold text-xl sm:text-2xl truncate">
            {app.company}
          </h3>
          <span className="text-white/70 text-base sm:text-lg truncate">
            {app.role}
          </span>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-end gap-3 text-white/80 w-full sm:w-auto">
          {app.finalized && (
            <span className="w-full ml-0 sm:ml-2 text-center text-md text-white/50 italic">
              Finalized
            </span>
          )}
          <IconButton
            icon={<Plus />}
            color={
              app.finalized
                ? "text-white/30 cursor-not-allowed"
                : "text-sky-500"
            }
            onClick={() => !app.finalized && onAddStep(app)}
          />
          <IconButton
            icon={<Flag />}
            color={
              app.finalized
                ? "text-white/30 cursor-not-allowed"
                : "text-amber-500"
            }
            onClick={() => !app.finalized && onFinalizeApp(app)}
          />
          <IconButton
            icon={<Pencil />}
            color={
              app.finalized ? "text-white/30 cursor-not-allowed" : "text-white"
            }
            onClick={() => !app.finalized && onEditApp(app)}
          />
          <IconButton
            icon={<Trash2 />}
            color="text-red-500"
            onClick={() => onDeleteApp(app)}
          />
          <IconButton
            icon={isOpen ? <ChevronUp /> : <ChevronDown />}
            color="text-white"
            onClick={toggleDetails}
          />
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CardDetails
              id={app.id}
              isOpen={isOpen}
              finalized={app.finalized}
              observation={app.observation}
              company={app.company}
              role={app.role}
              mode={app.mode}
              platform={app.platform}
              application_date={app.application_date}
              expected_salary={app.expected_salary}
              salary_range_min={app.salary_range_min}
              salary_range_max={app.salary_range_max}
              steps={steps}
              isLoading={isLoading}
              lastStepId={app.last_step?.id ?? undefined}
              lastStepColor={app.last_step?.color ?? undefined}
              onEditStep={(s) => onEditStep(s, app)}
              onDeleteStep={(s) => onDeleteStep(s, app)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Shared animated icon button
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
      whileHover={{ scale: 1.15, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className={`${color} hover:opacity-80
                 p-3 sm:p-2 
                 m-1 sm:m-0
                 rounded-md`}
      onClick={onClick}
    >
      {icon}
    </motion.button>
  );
}
