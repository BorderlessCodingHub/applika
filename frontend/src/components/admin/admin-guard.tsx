"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";

/**
 * Wraps admin-only routes. Redirects non-admin users to /dashboard.
 * While the backend doesn't serve is_admin yet, this guards the route
 * and can be toggled with a temporary flag for development.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // TODO: replace with real `user.is_admin` once backend supports it
  const isAdmin = user?.is_admin ?? false; // default true for brainstorm/dev

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAdmin, router]);

  if (isLoading) return null;
  if (!isAdmin) return null;

  return <>{children}</>;
}
