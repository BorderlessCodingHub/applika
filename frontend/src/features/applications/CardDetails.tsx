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
import { useApplicationSteps } from "@/features/applications/hooks/useApplicationSteps";

interface CardDetailsProps {
  id: number;
  isOpen: boolean;
  finalized?: boolean;
  observation?: string;
  company: string;
  role: string;
  mode: string;
  platform?: { name: string } | string;
  application_date: string;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  onEditStep: (step: any) => void;
  onDeleteStep: (step: any) => void;
}

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
  onEditStep,
  onDeleteStep,
}: CardDetailsProps) {
  const { steps, isLoading, isValidating } = useApplicationSteps(
    isOpen ? id : undefined
  );
  const loading = isLoading || isValidating;

  if (!isOpen) return null;

  const capitalize = (str?: string) =>
    str ? str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

  const platformName = platform ? platform : "—";

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl transition-all"
    >
      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-white/80 mb-4">
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
          value={capitalize(mode)}
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
        <div className="mt-6 mb-6 bg-white/5 rounded-xl p-3 text-white/80 text-sm">
          <strong>Observation:</strong> {observation}
        </div>
      )}

      {/* STEPS SECTION */}
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
                <div className="font-medium text-white">{step.step_name}</div>
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
    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
      <div className="text-white/60">{icon}</div>
      <div className="flex flex-col leading-tight">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-sm text-white font-medium truncate">
          {value || "—"}
        </span>
      </div>
    </div>
  );
}

function FlagIcon({ mode }: { mode: string }) {
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
