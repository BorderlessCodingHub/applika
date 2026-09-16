"use client";

import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
// import { StatsSection } from "@/components/landing/stats-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { OpenSourceSection } from "@/components/landing/open-source-section";
import { CtaSection } from "@/components/landing/cta-section";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      {/* <StatsSection /> */}
      <TestimonialsSection />
      <OpenSourceSection />
      <CtaSection />
    </>
  );
}
