"use client";
const steps = [
  {
    step: "01",
    title: "Sign in with GitHub",
    desc: "One click to authenticate — no forms, no passwords. Your account is ready instantly.",
  },
  {
    step: "02",
    title: "Add your applications",
    desc: "Log each application with company, role, platform, and salary. Track every detail that matters.",
  },
  {
    step: "03",
    title: "Analyze & optimize",
    desc: "Watch your dashboard light up with conversion rates, trends, and actionable insights.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="relative border-t border-border/60 bg-card/50">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-20">
        <div className="mb-16 text-center">
          <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide-label text-primary md:text-lg">
            How It Works
          </p>
          <h3 className="font-display text-2xl font-bold tracking-tight-display text-foreground md:text-3xl">
            From sign-up to insights in minutes
          </h3>
        </div>
        <div className="relative grid gap-8 md:grid-cols-3 md:gap-12">
          <div className="absolute left-[16.6%] right-[16.6%] top-10 hidden h-px bg-border md:block" />
          {steps.map((item) => (
            <div key={item.step} className="relative text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-card">
                <span className="font-display text-2xl font-bold text-primary">
                  {item.step}
                </span>
              </div>
              <h4 className="mb-2 font-display text-sm font-semibold text-foreground md:text-base">
                {item.title}
              </h4>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
