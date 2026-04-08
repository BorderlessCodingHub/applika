"use client";

import { motion } from "framer-motion";
import { Shield, Terminal } from "lucide-react";
import { AdminStatCards } from "@/components/admin/admin-stat-cards";
import {
  UserGrowthChart,
  NewUsersBarChart,
} from "@/components/admin/user-growth-chart";
import { SystemHealthPanel } from "@/components/admin/system-health-panel";
import { UserActivityTable } from "@/components/admin/user-activity-table";
import { SeniorityDonut } from "@/components/admin/seniority-donut";
import { TopPlatformsPanel } from "@/components/admin/top-platforms-panel";
import { ActivityHeatmap } from "@/components/admin/activity-heatmap";
import { useAuth } from "@/contexts/auth-context";

export function AdminPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/15">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground">
                Admin Console
              </h1>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Platform-wide analytics and user management
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="hidden items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/10 px-3 py-1.5 sm:flex"
          >
            <Terminal className="h-3 w-3 text-amber-400" />
            <span className="font-display text-[11px] font-medium uppercase tracking-wide-label text-amber-400">
              {user?.username ?? "admin"}
            </span>
          </motion.div>
        </div>

        {/* Decorative line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 h-px origin-left"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary)), #fbbf24 50%, transparent)",
          }}
        />
      </motion.div>

      {/* Stat cards */}
      <AdminStatCards />

      {/* Row: Growth chart + System health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserGrowthChart />
        </div>
        <SystemHealthPanel />
      </div>

      {/* Row: New users bar + Seniority donut + Top platforms */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NewUsersBarChart />
        <SeniorityDonut />
        <TopPlatformsPanel />
      </div>

      {/* Activity heatmap */}
      <ActivityHeatmap />

      {/* Users table */}
      <UserActivityTable />
    </div>
  );
}
