import type { Metadata } from "next";
import { McpPage } from "./mcp-page";

const pageTitle = "Applika MCP";
const pageDescription =
  "Connect Claude Code, Cursor, VS Code and other AI apps to your Applika account through the Applika MCP server: log applications, update the timeline and tailor CVs from your assistant.";

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/mcp" },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <McpPage />;
}
