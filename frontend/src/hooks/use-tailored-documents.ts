"use client";

import { useQuery } from "@tanstack/react-query";
import { services } from "@/services/services";

export function useTailoredDocument(documentId: string | null) {
  return useQuery({
    queryKey: ["tailored-document", documentId],
    queryFn: () => services.jobs.getTailoredDocument(documentId!),
    enabled: !!documentId,
  });
}
