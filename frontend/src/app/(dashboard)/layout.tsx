import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-950 to-black">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
      <Footer />
    </div>
  );
}
