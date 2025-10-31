import { redirect } from "next/navigation";
import { verifyAuth } from "@/lib/auth/verifyAuth";

/**
 * Root landing page.
 * Automatically redirects users to the correct area:
 *  - Authenticated → Dashboard (/)
 *  - Guest → Login (/auth/login)
 */
export default async function RootPage() {
  const isAuthenticated = await verifyAuth();

  if (isAuthenticated) {
    // Redirect authenticated users to the dashboard
    redirect("/dashboard");
  } else {
    // Redirect unauthenticated users to login
    redirect("/login");
  }

  // (This will never render because of redirect, but is required syntactically)
  return null;
}
