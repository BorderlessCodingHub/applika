"use client";

import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { FileText, RotateCcw, ChevronRight, Calendar } from "lucide-react";
import { useReports, mutateReports } from "../hooks/useReports";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { REPORT_DAYS } from "../services/reportsService";
import type { ReportStatus } from "../types/report.types";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0,
    },
  },
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 20,
    },
  },
};

function getReportStatus(day: number, currentDay: number): ReportStatus {
  if (day > currentDay) return "future";
  if (day === currentDay) return "pending";
  return "overdue";
}

function getReportPhase(day: number): number {
  if (day <= 30) return 1;
  if (day <= 60) return 2;
  if (day <= 90) return 3;
  return 4;
}

function ReportCard({
  day,
  status,
  submittedAt,
  onFill,
}: {
  day: number;
  status: ReportStatus;
  submittedAt: string | null;
  onFill: (day: number) => void;
}) {
  const isFuture = status === "future";
  const canFill = status === "pending" || status === "overdue";
  const phase = getReportPhase(day);

  return (
    <motion.div
      className={`relative bg-gray-800/50 rounded-lg border border-white/10 p-5 transition-all duration-300 ${
        isFuture
          ? "opacity-60 cursor-not-allowed"
          : "hover:bg-gray-800/70 hover:border-white/20 hover:shadow-lg hover:shadow-emerald-500/5"
      }`}
    >
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10">
            <span className="text-lg font-bold text-white">{day}</span>
          </div>
          <div>
            <h3 className="text-white font-semibold">Day {day}</h3>
            <p className="text-gray-400 text-sm">Phase {phase}</p>
          </div>
        </div>

        <div className="hidden sm:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <ReportStatusBadge status={status} />
        </div>

        <div className="flex items-center gap-3">
          {submittedAt ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Calendar size={14} />
              <span className="hidden sm:inline">
                Submitted {new Date(submittedAt).toLocaleDateString()}
              </span>
              <span className="sm:hidden">{new Date(submittedAt).toLocaleDateString()}</span>
            </div>
          ) : canFill ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onFill(day)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 hover:cursor-pointer text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-emerald-600/20"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">Fill Report</span>
              <span className="sm:hidden">Fill</span>
              <ChevronRight size={14} />
            </motion.button>
          ) : (
            <span className="text-gray-500 text-sm">Not available</span>
          )}
        </div>
      </div>

      <div className="sm:hidden mt-3">
        <ReportStatusBadge status={status} />
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-800/30 rounded-lg border border-white/5 p-5 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-gray-700/50" />
          <div className="space-y-2">
            <div className="w-20 h-5 rounded bg-gray-700/50" />
            <div className="w-16 h-4 rounded bg-gray-700/30" />
          </div>
        </div>
        <div className="w-24 h-8 rounded-full bg-gray-700/50" />
      </div>
    </div>
  );
}

export function ReportsList() {
  const router = useRouter();
  const { reports, currentDay, isLoading, error } = useReports();

  const handleFillReport = (day: number) => {
    router.push(`/reports/${day}`);
  };

  const handleRetry = () => {
    mutateReports();
  };

  if (isLoading) {
    return (
      <div>
        <div className="mb-8 animate-pulse">
          <div className="w-64 h-8 rounded bg-gray-700/50 mb-2" />
          <div className="w-48 h-5 rounded bg-gray-700/30" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-red-500/10 border border-red-500/30 rounded-lg p-8 text-center"
      >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
            <FileText size={32} className="text-red-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">
            Failed to load reports
          </h3>
          <p className="text-gray-400 mb-6">
            There was an error loading your reports. Please try again.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            Try Again
          </motion.button>
        </motion.div>
    );
  }

  const reportCards = REPORT_DAYS.map((day) => {
    const report = reports.find((r) => r.day === day);
    if (report) {
      return {
        day,
        status: report.status,
        submittedAt: report.submitted_at,
      };
    }
    return {
      day,
      status: getReportStatus(day, currentDay),
      submittedAt: null,
    };
  });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={headerVariants} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              My Reports
              <span className="text-emerald-400"> — 120 Days</span>
            </h1>
            <p className="text-gray-400">
              You are on{" "}
              <span className="text-emerald-400 font-semibold">
                Day {currentDay}
              </span>{" "}
              of the challenge
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="inline-flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="leading-none">Submitted</span>
            </span>
            <span className="inline-flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="leading-none">Pending</span>
            </span>
            <span className="inline-flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="leading-none">Overdue</span>
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={containerVariants} className="space-y-3">
        {reportCards.map((report) => (
          <ReportCard
            key={report.day}
            day={report.day}
            status={report.status}
            submittedAt={report.submittedAt}
            onFill={handleFillReport}
          />
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg"
      >
        <p className="text-blue-300 text-sm">
          <strong className="text-blue-200">Tip:</strong> Reports are due
          every 14 days during the 120-day challenge. Complete them on time
          to track your progress through each phase.
        </p>
      </motion.div>
    </motion.div>
  );
}
