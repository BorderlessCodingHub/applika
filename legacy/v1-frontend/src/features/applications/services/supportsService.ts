import { supportSchema } from "../schemas/supportSchema";
import type { SupportResponse } from "../schemas/supportSchema";
import { authFetcher } from "@/lib/auth/authFetcher";

/**
 * Centralized fetch with automatic redirect on 401.
 */
export async function fetchSupports(): Promise<SupportResponse> {
  const json = await authFetcher("/api/supports");
  return supportSchema.parse(json);
}
