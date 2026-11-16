const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://applika.dev";

/**
 * The MCP server address, always absolute: an AI app is not a browser on the
 * site, so a relative API base (production builds with `/api`) is resolved
 * against the site's origin. An absolute base (local and E2E stacks) is kept.
 */
function mcpEndpoint(): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  const path = `${base}/mcp`;
  return /^https?:\/\//.test(path)
    ? path
    : new URL(path.startsWith("/") ? path : `/${path}`, SITE_URL).toString();
}

export const APP_CONFIG = {
  envs: {
    apiBaseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
    siteUrl: SITE_URL,
  },
  borderless: {
    /** Where a visitor without a Borderless account signs up. */
    signUpUrl:
      process.env.NEXT_PUBLIC_BORDERLESS_SIGN_UP ||
      "https://platform.borderlesscoding.com/sign-up",
    /** The Borderless community's home. */
    homeUrl: "https://borderlesscoding.com",
  },
  mcp: {
    /** The public page that explains the MCP server. */
    page: "/mcp",
    /** The MCP server address the configs and the pages print. */
    endpoint: mcpEndpoint(),
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
