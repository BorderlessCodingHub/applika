"use client";

import { useQuery } from "@tanstack/react-query";

import { services } from "@/services/services";

/** `GET /platforms?name=` (KODI-035, AC9): the web platform picker's own list. */
export function usePlatforms(name?: string) {
  return useQuery({
    queryKey: ["platforms", name ?? ""],
    queryFn: () => services.platforms.list(name),
  });
}
