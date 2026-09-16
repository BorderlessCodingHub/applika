import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="noise-overlay relative min-h-screen bg-background">
      <LandingHeader />
      {children}
      <LandingFooter />
    </div>
  );
}
