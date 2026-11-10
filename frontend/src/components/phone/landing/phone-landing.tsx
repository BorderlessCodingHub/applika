"use client";

import Link from "next/link";
import { ArrowUpRight, Calendar, ChartLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { PhoneLandingHeader } from "@/components/phone/landing/phone-landing-header";
import { PhoneKanban } from "@/components/phone/phone-icons";
import { APP_CONFIG } from "@/config";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/BorderlessCodingHub/applika";

// People's names stay as written (the desktop testimonials do the same).
const QUOTE_NAME = "Matheus Oliveira";

const FEATURES = [
  { key: "track", Icon: PhoneKanban },
  { key: "interviews", Icon: Calendar },
  { key: "learn", Icon: ChartLine },
] as const;

const STEPS = ["signIn", "add", "analyze"] as const;

/** The preview card's progress: three stages done of four. */
const PREVIEW_DONE = 3;

/** v2/Landing below md, under the public phone header (Sign in, or Dashboard once signed in, as on desktop). */
export function PhoneLanding() {
  const t = useTranslations("phone.landing");
  const tLanding = useTranslations("landing");
  const tTimeline = useTranslations("timeline");
  const tNav = useTranslations("nav");
  const tStats = useTranslations("dashboard.stats");
  const tAccount = useTranslations("phone.account");
  const format = useFormatter();

  const stages = [
    t("preview.applied"),
    tTimeline("interviewTypeShort.initial_screening"),
    tTimeline("interviewTypeShort.technical"),
    tTimeline("eventType.offer"),
  ];

  return (
    <div
      data-slot="landing-phone"
      className="ph-app relative flex min-h-viewport flex-col md:hidden"
    >
      <PhoneLandingHeader />

      <main>
        <section className="ph-landing-hero">
          <p className="ph-landing-eyebrow">{t("eyebrow")}</p>
          <h1 className="ph-landing-h1">
            {t.rich("heroTitle", {
              highlight: (chunks) => (
                <span className="text-primary">{chunks}</span>
              ),
            })}
          </h1>
          <p className="ph-landing-lead">{t("heroBody")}</p>
        </section>

        <section aria-label={t("previewLabel")} className="ph-landing-preview">
          <div aria-hidden="true" className="ph-landing-preview-card">
            <div className="flex items-center gap-3">
              <span className="ph-landing-preview-tile">
                {t("preview.initials")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold">
                  {t("preview.company")}
                </div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {t("preview.role")}
                </div>
              </div>
              <span className="ph-landing-stage">{stages[2]}</span>
            </div>
            <div>
              <div className="grid grid-cols-4 gap-1.5">
                {stages.map((stage, index) => (
                  <div
                    key={stage}
                    className={cn(
                      "h-1.5 rounded-full",
                      index < PREVIEW_DONE ? "bg-primary" : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-[11px] text-muted-foreground">
                {stages.map((stage, index) => (
                  <span
                    key={stage}
                    className={cn(
                      index === PREVIEW_DONE - 1 &&
                        "font-semibold text-foreground",
                    )}
                  >
                    {stage}
                  </span>
                ))}
              </div>
            </div>
            <div className="ph-landing-event">
              <Calendar size={18} className="flex-none text-primary" />
              <span className="flex-1 text-[14px] font-medium">
                {t("preview.event")}
              </span>
              <span className="ph-mono text-[13px] text-muted-foreground">
                {t("preview.eventTime")}
              </span>
            </div>
            <div className="ph-landing-stats">
              <div>
                <div className="ph-mono text-[20px] font-bold">
                  {format.number(34)}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {tNav("applications")}
                </div>
              </div>
              <div>
                <div className="ph-mono text-[20px] font-bold">
                  {format.number(12)}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {tStats("active")}
                </div>
              </div>
              <div>
                <div className="ph-mono text-[20px] font-bold text-primary">
                  {format.number(0.059, {
                    style: "percent",
                    minimumFractionDigits: 1,
                  })}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {t("preview.successRate")}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ph-landing-features">
          {FEATURES.map(({ key, Icon }) => (
            <div key={key} className="flex gap-4">
              <span className="ph-landing-feature-tile">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="m-0 text-[17px] font-semibold">
                  {t(`features.${key}.title`)}
                </h2>
                <p className="mt-1 mb-0 text-[15px] leading-[1.55] text-muted-foreground">
                  {t(`features.${key}.body`)}
                </p>
              </div>
            </div>
          ))}
        </section>

        <section className="ph-landing-steps">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">
            {t("stepsTitle")}
          </h2>
          <ol className="mt-5 mb-0 flex list-none flex-col gap-[18px] p-0">
            {STEPS.map((key, index) => (
              <li key={key} className="flex items-baseline gap-3.5">
                <span className="ph-mono text-[14px] font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-[15px] leading-[1.5]">
                  <strong className="font-semibold">
                    {t(`steps.${key}.title`)}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    {t(`steps.${key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <figure className="mx-5 mt-12 mb-0">
          <blockquote className="ph-landing-quote">
            “{tLanding("testimonials.matheus.quote")}”
          </blockquote>
          <figcaption className="mt-3.5 text-[14px] text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {QUOTE_NAME}
            </strong>{" "}
            · {tLanding("testimonials.matheus.role")}
          </figcaption>
        </figure>

        <section className="ph-landing-open">
          <h2 className="m-0 text-[17px] font-semibold">
            {t("openSourceTitle")}
          </h2>
          <p className="mt-1.5 mb-0 text-[15px] leading-[1.55] text-muted-foreground">
            {t("openSourceBody")}
          </p>
          <a
            href={GITHUB_URL}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold"
          >
            {t("viewOnGithub")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="ph-landing-footer">
        <Link
          href="/cookie-policy"
          className="flex min-h-11 items-center text-muted-foreground"
        >
          {tAccount("cookiePolicy")}
        </Link>
        <span className="flex min-h-11 items-center text-muted-foreground">
          {t("copyright", { name: APP_CONFIG.name })}
        </span>
      </footer>
    </div>
  );
}
