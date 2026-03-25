"use client";

import type { ReportStatus } from "@/services/types/reports";
import { Check, Clock, X, Circle, LucideIcon } from "lucide-react";
import { Badge, type BadgeVariantsType } from "../ui/badge";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

type StatusConfigType = Record<
  ReportStatus,
  {
    icon: LucideIcon;
    label: string;
    variant: BadgeVariantsType;
  }
>;

const statusConfig = {
  submitted: {
    icon: Check,
    label: "Submitted",
    variant: "default",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    variant: "warning",
  },
  overdue: {
    icon: X,
    label: "Overdue",
    variant: "destructive",
  },
  future: {
    icon: Circle,
    label: "Future",
    variant: "secondary",
  },
} as StatusConfigType;

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={14} />
      {config.label}
    </Badge>
  );
}
