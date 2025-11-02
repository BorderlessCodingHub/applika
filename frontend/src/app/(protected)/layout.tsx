import DashboardProviders from "@/app/(protected)/dashboard/DashboardProviders";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Client-only providers should be rendered after auth passes
  return <DashboardProviders>{children}</DashboardProviders>;
}
