import type { Metadata } from "next";
import { CliPage } from "./cli-page";

const pageTitle = "applika-cli";
const pageDescription =
  "Track your job applications from the terminal with applika-cli, and teach your AI assistant to use it with the bundled skill.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/cli" },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <CliPage />;
}
