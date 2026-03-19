"use client";
import {
  BarChart3,
  Briefcase,
  LineChart,
  ListChecks,
  Shield,
} from "lucide-react";

const features = [
  {
    icon: Briefcase,
    title: "Track Applications",
    description:
      "Keep all your job applications organized in one place with company, role, platform, and salary details.",
  },
  {
    icon: ListChecks,
    title: "Step-by-Step Pipeline",
    description:
      "Follow every application through its hiring stages — from applied to offer — with custom steps and dates.",
  },
  {
    icon: BarChart3,
    title: "Conversion Analytics",
    description:
      "See which stages you pass most often, average days per step, and your overall success rate.",
  },
  {
    icon: LineChart,
    title: "Trend Insights",
    description:
      "Visualize your application volume over time and compare active vs passive sourcing strategies.",
  },
  {
    icon: Shield,
    title: "GitHub Authentication",
    description:
      "Sign in securely with your GitHub account — no extra passwords to remember.",
  },
  {
    icon: ListChecks,
    title: "Finalization & Feedback",
    description:
      "Close out applications with outcome tracking so you can learn from every process.",
  },
];

export function FeaturesSection() {
  return (
    <section className="relative mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
      <div className="mb-14 text-center">
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide-label text-primary md:text-lg">
          Features
        </p>
        <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
          Everything you need to manage your job search
        </h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className={`group animate-fade-in-up stagger-${i + 1} hover:shadow-elevated rounded-xl border border-border/60 bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5`}
          >
            <div className="mb-4 flex items-center gap-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h4 className="font-display text-sm font-semibold tracking-tight-display text-foreground md:text-base">
                {f.title}
              </h4>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
