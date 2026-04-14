import type { Metadata } from "next";
import { APP_CONFIG } from "@/config";
import { HomePage } from "./home-page";

const pageTitle = `${APP_CONFIG.name} — Track, Analyze & Win Your Job Search`;
const pageDescription =
  "Applika.dev is an open-source job application tracker. Centralize every application, visualize your funnel, monitor interview steps, and uncover insights that get you hired faster.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: APP_CONFIG.envs.siteUrl,
    siteName: APP_CONFIG.name,
    title: pageTitle,
    description: pageDescription,
    locale: APP_CONFIG.locale,
    images: [
      {
        url: APP_CONFIG.ogImage,
        width: 1280,
        height: 720,
        alt: `${APP_CONFIG.name} — open-source job application tracker`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: APP_CONFIG.twitterHandle,
    creator: APP_CONFIG.twitterHandle,
    title: pageTitle,
    description: pageDescription,
    images: [APP_CONFIG.ogImage],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${APP_CONFIG.envs.siteUrl}/#organization`,
      name: APP_CONFIG.name,
      url: APP_CONFIG.envs.siteUrl,
      logo: `${APP_CONFIG.envs.siteUrl}/logo.webp`,
      sameAs: ["https://github.com/applikadev"],
    },
    {
      "@type": "WebSite",
      "@id": `${APP_CONFIG.envs.siteUrl}/#website`,
      url: APP_CONFIG.envs.siteUrl,
      name: APP_CONFIG.name,
      description: pageDescription,
      publisher: { "@id": `${APP_CONFIG.envs.siteUrl}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      name: APP_CONFIG.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: pageDescription,
      url: APP_CONFIG.envs.siteUrl,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
         
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage />
    </>
  );
}
