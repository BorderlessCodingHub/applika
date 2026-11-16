import type { Metadata } from "next";
import { CliForward } from "./cli-forward";

/**
 * `/cli` was the applika-cli page; the Applika MCP page replaced it (ADR-0028).
 * A saved link still lands on `/mcp`: a client-side forward, since this
 * static export has no server rewrite. The page itself is never indexed.
 */
export const metadata: Metadata = {
  title: "Applika MCP",
  alternates: { canonical: "/mcp" },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <CliForward />;
}
