"use client";
import { motion } from "framer-motion";
import { useTopCompanies } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function TopCompaniesPanel() {
  const { data, isLoading } = useTopCompanies();

  const max = data ? Math.max(...data.map((d) => d.total_across_users)) : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-violet-400" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            Top Companies
          </h3>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="py-6 text-center text-xs text-muted-foreground/60">
            No company data yet
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((company, i) => {
              const pct = (company.total_across_users / max) * 100;

              return (
                <motion.div
                  key={company.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.65 + i * 0.06 }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-display text-sm font-medium text-foreground">
                      {company.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground/60">
                        {company.unique_users} users
                      </span>
                      <span className="font-display text-sm font-bold tabular-nums text-foreground">
                        {company.total_across_users}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-accent/50">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #a855f7 0%, #ec4899 100%)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.75 + i * 0.06,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
