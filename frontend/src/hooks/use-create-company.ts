"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { services } from "@/services/services";
import type { NewCompanyPayload } from "@/services/interfaces/i-company-service";

/**
 * `POST /companies` (PRD 0010): used by the new-with-cv draft flow and the
 * company picker when the user confirms a URL for a new company — 201
 * creates it, 200 reuses an existing visible name+url match (AC18, R-021).
 * Resolves `{company, created}` so a caller can tell the two apart. Raises
 * no toast: this fires as a side effect of autosave, and
 * `AutosaveStatus`/the catalog picker's own notice already tell the user
 * what happened.
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: NewCompanyPayload) => services.companies.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-search"] });
    },
  });
}
