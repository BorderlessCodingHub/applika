import { redirect } from "next/navigation";

/**
 * Root landing page.
 * Middleware ensures correct authentication flow:
 * - Authenticated users → continue
 * - Unauthenticated users → redirected automatically
 */
export default function RootPage() {
  redirect("/dashboard");
  return null;
}
