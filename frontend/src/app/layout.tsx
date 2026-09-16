import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { RootProviders } from "@/components/layout/root-providers";
import { APP_CONFIG } from "@/config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_CONFIG.envs.siteUrl),
  title: {
    default: APP_CONFIG.name,
    template: `%s | ${APP_CONFIG.name}`,
  },
  description: APP_CONFIG.description,
  applicationName: APP_CONFIG.name,
  keywords: APP_CONFIG.keywords,
  authors: [{ name: APP_CONFIG.name, url: APP_CONFIG.envs.siteUrl }],
  creator: APP_CONFIG.name,
  publisher: APP_CONFIG.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.webp",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: APP_CONFIG.locale,
    url: APP_CONFIG.envs.siteUrl,
    siteName: APP_CONFIG.name,
    title: APP_CONFIG.name,
    description: APP_CONFIG.description,
    images: [
      {
        url: APP_CONFIG.ogImage,
        width: 1200,
        height: 630,
        alt: `${APP_CONFIG.name} — job application tracker`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: APP_CONFIG.twitterHandle,
    creator: APP_CONFIG.twitterHandle,
    title: APP_CONFIG.name,
    description: APP_CONFIG.description,
    images: [APP_CONFIG.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: "#0c0d12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
