import "./globals.css";
import type { Metadata } from "next";
import { RootProviders } from "@/components/layout/root-providers";
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
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
