import { redirect } from "next/navigation";
import { verifyAuth } from "@/lib/auth/verifyAuth";
import DashboardProviders from "@/app/(protected)/dashboard/DashboardProviders";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = await verifyAuth();

  if (!isAuthenticated) {
    redirect("/login");
  }

  // Client-only providers should be rendered after auth passes
  return <DashboardProviders>{children}</DashboardProviders>;
}
