"use client";
import { motion } from "framer-motion";
import {
  Users,
  Activity,
  FileText,
  Trophy,
  XCircle,
  TrendingUp,
  BarChart3,
  UserPlus,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { useAdminStats } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter } from "./animated-counter";
import type { LucideIcon } from "lucide-react";
import { AdminPlatformStats } from "@/services/types/admin";

interface StatDef {
  key: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  glowColor: string;
  getValue: (d: AdminPlatformStats | undefined) => number;
  suffix?: string;
  decimals?: number;
}

const STATS: StatDef[] = [
  {
    key: "total_users",
    label: "Total Users",
    icon: Users,
    accent: "text-amber-400",
    glowColor: "rgba(251, 191, 36, 0.12)",
    getValue: (d) => {
      return d ? d.total_users : 0;
    },
  },
  {
    key: "active_30d",
    label: "Active (30d)",
    icon: Activity,
    accent: "text-emerald-400",
    glowColor: "rgba(52, 211, 153, 0.12)",
    getValue: (d) => {
      return d ? d.active_users_30d : 0;
    },
  },
  {
    key: "new_7d",
    label: "New (7d)",
    icon: UserPlus,
    accent: "text-sky-400",
    glowColor: "rgba(56, 189, 248, 0.12)",
    getValue: (d) => {
      return d ? d.new_users_7d : 0;
    },
  },
  {
    key: "total_apps",
    label: "Applications",
    icon: FileText,
    accent: "text-violet-400",
    glowColor: "rgba(167, 139, 250, 0.12)",
    getValue: (d) => {
      return d ? d.total_applications : 0;
    },
  },
  {
    key: "avg_apps",
    label: "Avg / User",
    icon: BarChart3,
    accent: "text-orange-400",
    glowColor: "rgba(251, 146, 60, 0.12)",
    getValue: (d) => {
      return d ? d.avg_applications_per_user : 0;
    },
    decimals: 1,
  },
  {
    key: "offers",
    label: "Total Offers",
    icon: Trophy,
    accent: "text-primary",
    glowColor: "hsl(168 70% 48% / 0.12)",
    getValue: (d) => {
      return d ? d.total_offers : 0;
    },
  },
  {
    key: "denials",
    label: "Total Denials",
    icon: XCircle,
    accent: "text-rose-400",
    glowColor: "rgba(251, 113, 133, 0.12)",
    getValue: (d) => {
      return d ? d.total_denials : 0;
    },
  },
  {
    key: "success_rate",
    label: "Success Rate",
    icon: TrendingUp,
    accent: "text-emerald-400",
    glowColor: "rgba(52, 211, 153, 0.12)",
    getValue: (d) => {
      return d ? d.global_success_rate : 0;
    },
    suffix: "%",
    decimals: 1,
  },
  {
    key: "finalization_rate",
    label: "Finalization Rate",
    icon: CheckCircle2,
    accent: "text-cyan-400",
    glowColor: "rgba(34, 211, 238, 0.12)",
    getValue: (d) => {
      return d ? d.finalization_rate : 0;
    },
    suffix: "%",
    decimals: 1,
  },
  {
    key: "apps_30d",
    label: "Apps (30d)",
    icon: CalendarDays,
    accent: "text-pink-400",
    glowColor: "rgba(244, 114, 182, 0.12)",
    getValue: (d) => {
      return d ? d.applications_last_30d : 0;
    },
  },
];

export function AdminStatCards() {
  const { data, isLoading } = useAdminStats();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
      {STATS.map((stat, i) => (
        <motion.div
          key={stat.key}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            duration: 0.5,
            delay: i * 0.06,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="admin-card hover:shadow-elevated group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition-all duration-300 hover:border-border"
        >
          {/* Subtle glow on hover */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background: `radial-gradient(ellipse at 50% 0%, ${stat.glowColor}, transparent 70%)`,
            }}
          />

          <div className="relative z-10">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-[11px] font-medium uppercase tracking-wide-label text-muted-foreground">
                {stat.label}
              </span>
              <stat.icon className={`h-4 w-4 ${stat.accent} opacity-70`} />
            </div>

            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <AnimatedCounter
                value={stat.getValue(data)}
                decimals={stat.decimals ?? 0}
                suffix={stat.suffix ?? ""}
                className={`font-display text-2xl font-bold tabular-nums tracking-tight ${stat.accent}`}
              />
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
