"use client";

import { Code2, GitFork } from "lucide-react";

const values = [
  {
    icon: Code2,
    title: "Built in the Open",
    description:
      "Every line of code is public. Read it, audit it, learn from it — full transparency from day one.",
  },
  {
    icon: GitFork,
    title: "Community Driven",
    description:
      "Feature requests, bug reports, and pull requests are all welcome. Shape the tool you use every day.",
  },
];

export function OpenSourceSection() {
  return (
    <section className="relative border-t border-border/60 bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-14 text-center">
          <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide-label text-primary md:text-lg">
            Open Source
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            Transparent by design, built for the community
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Applika is fully open source. We believe job seekers deserve tools
            that respect their privacy and put them in control.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {values.map((v, i) => (
            <div
              key={v.title}
              className={`group animate-fade-in-up stagger-${i + 1} rounded-xl border border-border/60 bg-background p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated`}
            >
              <div className="mb-4 flex items-center gap-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                  <v.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="font-display text-sm font-semibold tracking-tight-display text-foreground md:text-base">
                  {v.title}
                </h4>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {v.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
