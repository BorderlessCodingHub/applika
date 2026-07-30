import type { Metadata } from "next";
import { APP_CONFIG } from "@/config";
import { CookiePolicyPage } from "./cookie-policy-page";

const pageTitle = "Cookie Policy";
const pageDescription = `How ${APP_CONFIG.name} uses essential cookies for session control. No analytics, advertising, or tracking cookies.`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/cookie-policy" },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <CookiePolicyPage />;
}
