export const APP_CONFIG = {
  envs: {
    apiBaseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://applika.dev",
  },
  name: "Applika.dev",
  shortName: "Applika.dev",
  logo: "app-logo.webp",
  ogImage: "/images/applika-ad.webp",
  twitterHandle: "@applikadev",
  locale: "en_US",
  keywords: [
    "job application tracker",
    "applika",
    "career tracker",
    "interview pipeline",
    "open source job tracker",
    "application analytics",
  ],
  get subtitle() {
    return `Welcome back to ${this.name}`;
  },
  get description() {
    return `${this.name} — a centralized dashboard to manage, track, and analyze your job applications. View trends, conversion funnel, platform distribution, step-by-step progress, and summary statistics. Integrates with the backend API for real-time insights.`;
  },
};
