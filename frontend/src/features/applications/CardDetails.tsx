"use client";

import { motion } from "framer-motion";
import {
  Pencil,
  Trash2,
  CalendarDays,
  Building2,
  Briefcase,
  Globe,
  DollarSign,
  Flag,
} from "lucide-react";
import CardDetailsSkeleton from "@/components/ui/CardDetailsSkeleton";
import { CardDetailsProps } from "@/features/applications/types";

export default function CardDetails({
  id,
  isOpen,
  finalized = false,
  observation,
  company,
  role,
  mode,
  platform,
  application_date,
  expected_salary,
  salary_range_min,
  salary_range_max,
  steps,
  isLoading,
  lastStepId,
  lastStepColor,
  onEditStep,
  onDeleteStep,
}: CardDetailsProps) {

  if (!isOpen) return null;

  const capitalize = (str?: string) =>
    str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

  const platformName =
    typeof platform === "string" ? platform : platform?.name ?? "—";

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 w-full p-2 rounded-2xl transition-all"
    >
      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-white/80 mb-8 justify-items-center">
        <DetailItem
          icon={<Building2 size={16} />}
          label="Company"
          value={capitalize(company)}
        />
        <DetailItem
          icon={<Briefcase size={16} />}
          label="Role"
          value={capitalize(role)}
        />
        <DetailItem
          icon={<CalendarDays size={16} />}
          label="Application Date"
          value={application_date}
        />
        <DetailItem
          icon={<Globe size={16} />}
          label="Platform"
          value={capitalize(platformName)}
        />
        <DetailItem
          icon={<FlagIcon mode={mode} />}
          label="Mode"
          value={capitalize(mode ?? "-")}
        />
        <DetailItem
          icon={<DollarSign size={16} />}
          label="Salary"
          value={
            expected_salary
              ? `Expected: $${expected_salary.toLocaleString()}`
              : salary_range_min && salary_range_max
              ? `$${salary_range_min.toLocaleString()} - $${salary_range_max.toLocaleString()}`
              : "—"
          }
        />
      </div>

      {/* OBSERVATION SECTION */}
      {observation && (
        <div className="bg-white/10 border border-white/20 rounded-xl p-4 mb-6 overflow-hidden">
          <span className="text-white/80 font-semibold">Observation:</span>
          <p className="text-white/70 text-base mt-1 leading-relaxed break-words whitespace-pre-wrap">
            {observation}
          </p>
        </div>
      )}

      {/* STEPS SECTION */}
      {isLoading ? (
        <CardDetailsSkeleton />
      ) : steps.length > 0 ? (
        <div className="space-y-4">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center w-[85%] mx-auto p-4 sm:p-5"
            >
              <div className="flex-1 flex flex-col w-full items-center sm:items-start text-center sm:text-left">
                {/* Step Info */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center sm:justify-between w-full gap-2 sm:gap-4">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center sm:justify-between gap-2 w-full">
                    <div className="flex items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            String(step.step_id) === String(lastStepId)
                              ? lastStepColor ?? "rgba(255,255,255,0.2)"
                              : "rgba(255,255,255,0.2)",
                        }}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 items-center">
                        <div className="font-medium text-white text-xl sm:text-lg">
                          {step.step_name}
                        </div>
                        <div className="text-white/60 text-lg sm:text-base">
                          {step.step_date}
                        </div>
                      </div>
                    </div>

                    {/* Buttons for medium+ screens */}
                    <div className="hidden sm:flex gap-3 justify-end ml-auto">
                      <IconButton
                        icon={<Pencil size={24} />}
                        color={
                          finalized
                            ? "text-white/30 cursor-not-allowed"
                            : "text-blue-400"
                        }
                        onClick={() => !finalized && onEditStep(step)}
                      />
                      <IconButton
                        icon={<Trash2 size={24} />}
                        color={
                          finalized
                            ? "text-white/30 cursor-not-allowed"
                            : "text-red-400"
                        }
                        onClick={() => !finalized && onDeleteStep(step)}
                      />
                    </div>
                  </div>

                  {/* Buttons for small screens */}
                  <div className="flex sm:hidden flex-wrap gap-4 mt-2 justify-center w-full">
                    <IconButton
                      icon={<Pencil size={28} />}
                      color={
                        finalized
                          ? "text-white/30 cursor-not-allowed"
                          : "text-blue-400"
                      }
                      onClick={() => !finalized && onEditStep(step)}
                      smallScreenProps={{ className: "p-3 m-1" }}
                    />
                    <IconButton
                      icon={<Trash2 size={28} />}
                      color={
                        finalized
                          ? "text-white/30 cursor-not-allowed"
                          : "text-red-400"
                      }
                      onClick={() => !finalized && onDeleteStep(step)}
                      smallScreenProps={{ className: "p-3 m-1" }}
                    />
                  </div>
                </div>

                {/* Step Observation */}
                {step.observation && (
                  <div className="bg-white/10 border border-white/20 rounded-xl p-3 mt-3 w-full mx-auto shadow-sm backdrop-blur-md overflow-hidden">
                    <span className="text-white/80 font-semibold text-sm md:text-base">
                      Observation:
                    </span>
                    <p className="text-white/70 text-sm md:text-base mt-1 leading-relaxed tracking-wide break-words whitespace-pre-wrap">
                      {step.observation}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-white/60 italic text-sm">
          No steps found for this application.
        </div>
      )}
    </motion.div>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-white/60">{icon}</div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm text-white/60">{label}</span>
        <span className="text-lg sm:text-xl text-white font-medium truncate">
          {value || "—"}
        </span>
      </div>
    </div>
  );
}

function FlagIcon({ mode }: { mode?: string }) {
  const color =
    mode === "active"
      ? "text-sky-400"
      : mode === "paused"
      ? "text-yellow-400"
      : mode === "finalized"
      ? "text-green-400"
      : "text-white/60";

  return <Flag className={color} size={16} />;
}

function IconButton({
  icon,
  color,
  onClick,
  smallScreenProps,
}: {
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  smallScreenProps?: { className?: string };
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.15, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
      className={`${color} hover:opacity-80 p-2 rounded-md ${
        smallScreenProps?.className || ""
      }`}
      onClick={onClick}
    >
      {icon}
    </motion.button>
  );
}
