import { ReactNode } from "react";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <div className="w-full max-w-lg p-8 md:bg-white/5 md:border md:border-white/20 md:rounded-2xl md:backdrop-blur-xl md:shadow-xl">
        <div className="text-center mb-6">
          <img
            src="/images/app-logo.webp"
            alt="Job Tracker Logo"
            className="w-28 mx-auto"
          />
          <h2 className="text-2xl font-semibold text-white mt-4">{title}</h2>
          {subtitle && <p className="text-white/60 mt-2">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
