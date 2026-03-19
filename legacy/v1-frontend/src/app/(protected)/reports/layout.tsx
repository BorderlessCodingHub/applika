import MainLayout from "@/components/layout/MainLayout";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
