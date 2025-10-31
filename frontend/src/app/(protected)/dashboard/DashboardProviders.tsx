"use client";

import { SWRConfig } from "swr";
import { ModalProvider } from "@/features/applications/context/ModalProvider";
import { fetcher } from "@/features/home/services/dashboardService";

export default function DashboardProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        revalidateIfStale: false,
        dedupingInterval: 60000,
        shouldRetryOnError: true,
        errorRetryInterval: 5000,
      }}
    >
      <ModalProvider>{children}</ModalProvider>
    </SWRConfig>
  );
}