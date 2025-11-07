"use client";

import { SWRConfig } from "swr";
import { ModalProvider } from "@/features/applications/context/ModalProvider";
import { authFetcher } from "@/lib/auth/authFetcher";

export default function DashboardProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRConfig
      value={{
        fetcher: authFetcher,
        revalidateOnFocus: true,
        revalidateIfStale: true,
        dedupingInterval: 2000,
        shouldRetryOnError: true,
        errorRetryInterval: 5000,
      }}
    >
      <ModalProvider>{children}</ModalProvider>
    </SWRConfig>
  );
}