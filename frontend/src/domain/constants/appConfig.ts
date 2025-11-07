export const appConfig = {
  name: "Application Tracker",
  shortName: "Application Tracker",
  logo: "/images/app-logo.webp",
  get subtitle() {
    return `Welcome back to ${this.name}`;
  },
  get description() {
    return `${this.name} — a centralized dashboard to manage, track, and analyze your job applications. View trends, conversion funnel, platform distribution, step-by-step progress, and summary statistics. Integrates with the backend API for real-time insights.`;
  },
  repository: process.env.NEXT_PUBLIC_APP_REPO,
};
