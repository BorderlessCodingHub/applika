import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";

// `md:contents`, not `md:block`: the header stays sticky against the page, not a wrapper.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="noise-overlay relative min-h-viewport bg-background">
      <div className="hidden md:contents">
        <LandingHeader />
      </div>
      {children}
      <div className="hidden md:contents">
        <LandingFooter />
      </div>
    </div>
  );
}
