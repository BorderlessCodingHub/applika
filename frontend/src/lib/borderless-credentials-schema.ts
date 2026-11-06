import { z } from "zod";

import { word } from "@/i18n/translator";

/**
 * Mirrors `BorderlessCredentials` on the API: email 1..100, password 1..200.
 * The messages (`auth.credentials.*`) are read each time the form validates,
 * so they come in the active language.
 */
export const borderlessCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: () => word("auth.credentials.emailRequired") })
    .max(100, { error: () => word("auth.credentials.emailTooLong") }),
  password: z
    .string()
    .min(1, { error: () => word("auth.credentials.passwordRequired") })
    .max(200, { error: () => word("auth.credentials.passwordTooLong") }),
});
