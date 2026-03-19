import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/layout/providers";
import { APP_CONFIG } from "@/config";

export const metadata: Metadata = {
  title: APP_CONFIG.name,
  description: APP_CONFIG.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
