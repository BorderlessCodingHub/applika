"use client";

import type { ReportStatus } from "@/services/types/reports";
import { Check, Clock, X, Circle, LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge, type BadgeVariantsType } from "../ui/badge";

interface ReportStatusBadgeProps {
  status: ReportStatus;
}

type StatusConfigType = Record<
  ReportStatus,
  {
    icon: LucideIcon;
    variant: BadgeVariantsType;
  }
>;

const statusConfig = {
  submitted: {
    icon: Check,
    variant: "default",
  },
  pending: {
    icon: Clock,
    variant: "warning",
  },
  overdue: {
    icon: X,
    variant: "destructive",
  },
  future: {
    icon: Circle,
    variant: "secondary",
  },
} as StatusConfigType;

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  const t = useTranslations("reports.status");
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={14} />
      {t(status)}
    </Badge>
  );
}
