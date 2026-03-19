"use client";
import { motion } from "framer-motion";
import {
  Zap,
  Clock,
  AlertTriangle,
  Database,
  HardDrive,
  Layers,
  Rocket,
  LucideIcon,
} from "lucide-react";
import { useSystemHealth } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function HealthIndicator({
  label,
  value,
  icon: Icon,
  status,
  subtext,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  status: "green" | "amber" | "red";
  subtext?: string;
}) {
  const statusColors = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
  };

  const statusGlow = {
    green: "shadow-[0_0_8px_rgba(52,211,153,0.4)]",
    amber: "shadow-[0_0_8px_rgba(251,191,36,0.4)]",
    red: "shadow-[0_0_8px_rgba(251,113,133,0.4)]",
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-display text-xs font-medium uppercase tracking-wide-label text-muted-foreground">
            {label}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold tabular-nums text-foreground">
              {value}
            </span>
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                statusColors[status],
                statusGlow[status]
              )}
            />
          </div>
        </div>
        {subtext && (
          <span className="text-[10px] text-muted-foreground/70">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}

export function SystemHealthPanel() {
  const { data, isLoading } = useSystemHealth();

  const latencyStatus = !data
    ? "green"
    : data.api_latency_ms < 30
      ? "green"
      : data.api_latency_ms < 80
        ? "amber"
        : "red";
  const uptimeStatus = !data
    ? "green"
    : data.uptime_pct > 99.9
      ? "green"
      : data.uptime_pct > 99
        ? "amber"
        : "red";
  const errorStatus = !data
    ? "green"
    : data.error_rate_pct < 0.1
      ? "green"
      : data.error_rate_pct < 1
        ? "amber"
        : "red";
  const dbStatus = !data
    ? "green"
    : data.db_connections < data.db_connections_max * 0.6
      ? "green"
      : data.db_connections < data.db_connections_max * 0.85
        ? "amber"
        : "red";

  const timeSinceDeploy = data
    ? formatTimeSince(new Date(data.last_deploy))
    : "--";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-2 flex items-center gap-3">
          <div className="relative h-2 w-2">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-40" />
            <div className="relative h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            System Health
          </h3>
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
            live · 15s
          </span>
        </div>

        {isLoading ? (
          <div className="mt-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            <HealthIndicator
              label="API Latency"
              value={`${data!.api_latency_ms}ms`}
              icon={Zap}
              status={latencyStatus}
            />
            <HealthIndicator
              label="Uptime"
              value={`${data!.uptime_pct.toFixed(2)}%`}
              icon={Clock}
              status={uptimeStatus}
            />
            <HealthIndicator
              label="Error Rate"
              value={`${data!.error_rate_pct.toFixed(2)}%`}
              icon={AlertTriangle}
              status={errorStatus}
            />
            <HealthIndicator
              label="DB Connections"
              value={`${data!.db_connections} / ${data!.db_connections_max}`}
              icon={Database}
              status={dbStatus}
            />
            <HealthIndicator
              label="Cache Hit"
              value={`${data!.cache_hit_rate.toFixed(1)}%`}
              icon={HardDrive}
              status={data!.cache_hit_rate > 90 ? "green" : "amber"}
            />
            <HealthIndicator
              label="Queue Depth"
              value={`${data!.queue_depth}`}
              icon={Layers}
              status={
                data!.queue_depth < 5
                  ? "green"
                  : data!.queue_depth < 15
                    ? "amber"
                    : "red"
              }
            />
            <HealthIndicator
              label="Last Deploy"
              value={timeSinceDeploy}
              icon={Rocket}
              status="green"
            />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function formatTimeSince(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
