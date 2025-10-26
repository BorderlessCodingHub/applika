import { supportSchema } from "../schemas/supportSchema";
import type { SupportResponse } from "../schemas/supportSchema";

async function parseErrorResponse(res: Response) {
  try {
    const json = await res.json();
    return json.detail ?? JSON.stringify(json);
  } catch {
    const text = await res.text();
    return text || "Unknown error";
  }
}

/**
 * Low-level fetch + runtime validation for /api/supports
 * Re-usable across hooks and services.
 */
export async function fetchSupports(): Promise<SupportResponse> {
  const res = await fetch("/api/supports", { credentials: "include" });

  if (!res.ok) {
    const msg = await parseErrorResponse(res);
    throw new Error(msg || "Failed to fetch supports");
  }

  const json = await res.json();
  // validate shape with zod
  const parsed = supportSchema.parse(json);
  return parsed;
}
