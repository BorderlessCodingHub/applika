"use client";

import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { StatsSection } from "@/components/landing/stats-section";
import { TestimonialsSection } from "@/components/landing/testimonials-section";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingFooter } from "@/components/landing/landing-footer";

export function HomePage() {
  return (
    <div className="noise-overlay relative min-h-screen bg-background">
      <LandingHeader />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <StatsSection />
      <TestimonialsSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
