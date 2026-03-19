"use client";

import { Check, Clock, X, Circle } from "lucide-react";
import type { ReportStatus } from "../types/report.types";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

const statusConfig = {
  submitted: {
    icon: Check,
    label: "Submitted",
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    iconClassName: "text-emerald-400",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    iconClassName: "text-yellow-400",
  },
  overdue: {
    icon: X,
    label: "Overdue",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
    iconClassName: "text-red-400",
  },
  future: {
    icon: Circle,
    label: "Future",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    iconClassName: "text-gray-400",
  },
};

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      <Icon size={14} className={config.iconClassName} />
      {config.label}
    </span>
  );
}
