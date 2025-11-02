import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/getSession";

/**
 * Root landing page.
 * Automatically redirects users to the correct area:
 *  - Authenticated → Dashboard (/)
 *  - Guest → Login (/auth/login)
 */
export default async function RootPage() {
  const { access } = await getSession();
  console.log(access);

  if (access) {
    // Redirect authenticated users to the dashboard
    redirect("/dashboard");
  } else {
    // Redirect unauthenticated users to login
    redirect("/login");
  }

  // (This will never render because of redirect, but is required syntactically)
  return null;
}
