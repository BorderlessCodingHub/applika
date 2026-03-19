"use client";
import { motion } from "framer-motion";
import { useActivityHeatmap } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatColor(count: number, max: number): string {
  if (count === 0) return "hsl(var(--accent) / 0.3)";
  const intensity = count / max;
  if (intensity < 0.25) return "hsl(168 70% 48% / 0.2)";
  if (intensity < 0.5) return "hsl(168 70% 48% / 0.4)";
  if (intensity < 0.75) return "hsl(168 70% 48% / 0.65)";
  return "hsl(168 70% 48% / 0.9)";
}

export function ActivityHeatmap() {
  const { data, isLoading } = useActivityHeatmap();

  const max = data ? Math.max(...data.map((d) => d.count), 1) : 1;

  const grid = new Map<string, number>();
  data?.forEach((p) => grid.set(`${p.day}-${p.hour}`, p.count));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
            Activity Heatmap
          </h3>
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            applications / hour
          </span>
        </div>

        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-lg" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="mb-1 ml-10 flex">
                {HOURS.filter((h) => h % 3 === 0).map((h) => (
                  <span
                    key={h}
                    className="font-display text-[9px] tabular-nums text-muted-foreground/50"
                    style={{ width: `${100 / 8}%`, textAlign: "center" }}
                  >
                    {h.toString().padStart(2, "0")}
                  </span>
                ))}
              </div>

              {/* Grid rows */}
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="mb-[3px] flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-right font-display text-[10px] text-muted-foreground/60">
                    {day}
                  </span>
                  <div className="flex flex-1 gap-[2px]">
                    {HOURS.map((hour) => {
                      const count = grid.get(`${dayIdx}-${hour}`) ?? 0;
                      return (
                        <motion.div
                          key={hour}
                          className="h-5 flex-1 rounded-[3px] transition-colors"
                          style={{ backgroundColor: getHeatColor(count, max) }}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            duration: 0.3,
                            delay: 0.7 + dayIdx * 0.03 + hour * 0.008,
                          }}
                          title={`${day} ${hour}:00 — ${count} applications`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="mt-3 flex items-center justify-end gap-1.5">
                <span className="text-[9px] text-muted-foreground/50">
                  Less
                </span>
                {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                  <div
                    key={i}
                    className="h-3 w-3 rounded-[2px]"
                    style={{
                      backgroundColor:
                        intensity === 0
                          ? "hsl(var(--accent) / 0.3)"
                          : `hsl(168 70% 48% / ${intensity * 0.9})`,
                    }}
                  />
                ))}
                <span className="text-[9px] text-muted-foreground/50">
                  More
                </span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
