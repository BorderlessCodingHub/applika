import Navbar from "@/components/navigation/Navbar";
import Footer from "@/components/navigation/Footer";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-gray-950 to-black">
      <Navbar />
      <main className="flex-1 w-full mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-16">
        {children}
      </main>
      <Footer />
    </div>
  );
}
