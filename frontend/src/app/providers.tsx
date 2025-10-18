"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/features/home/services/dashboardService";

export default function Providers({ children }: { children: React.ReactNode }) {
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
      {children}
    </SWRConfig>
  );
}
