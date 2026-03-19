export const APP_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  name: "Applika.dev",
  shortName: "Applika.dev",
  logo: "app-logo.webp",
  get subtitle() {
    return `Welcome back to ${this.name}`;
  },
  get description() {
    return `${this.name} — a centralized dashboard to manage, track, and analyze your job applications. View trends, conversion funnel, platform distribution, step-by-step progress, and summary statistics. Integrates with the backend API for real-time insights.`;
  },
};
