"use client";

import { useFormatter, useTranslations } from "next-intl";
// Each stat's label is `landing.stats.<key>`; its value is written the way
// the active language writes numbers.
const stats = [
  { key: "applications", value: 2400, suffix: "+" },
  { key: "seekers", value: 340, suffix: "+" },
  { key: "offerRate", value: 0.28, percent: true },
  { key: "satisfaction", value: 4.9, suffix: "★" },
] as const;

export function StatsSection() {
  const t = useTranslations("landing");
  const format = useFormatter();
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-5xl px-5 py-20 md:px-8 md:py-28">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.key} className="text-center">
              <p className="font-numeric text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
                {"percent" in stat
                  ? format.number(stat.value, { style: "percent" })
                  : `${format.number(stat.value)}${stat.suffix}`}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`stats.${stat.key}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
