import { z } from "zod";

/** Mirrors `BorderlessCredentials` on the API: email 1..100, password 1..200. */
export const borderlessCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your Borderless email")
    .max(100, "Email must be at most 100 characters"),
  password: z
    .string()
    .min(1, "Enter your password")
    .max(200, "Password must be at most 200 characters"),
});
