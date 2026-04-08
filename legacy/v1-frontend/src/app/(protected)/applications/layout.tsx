import MainLayout from "@/components/layout/MainLayout";

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
