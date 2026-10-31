import z from "zod";

import { word } from "@/i18n/translator";

// ─── Constants ──────────────────────────────────────────────────────────────

export const WIN_MAX = 280;
export const CHALLENGE_MAX = 280;
export const GOAL_MAX = 500;

// ─── Schema ─────────────────────────────────────────────────────────────────

// Each message is a function: zod calls it when the field fails, so the words
// follow the language active at validation time, not at import time.
const required = { error: () => word("reports.errors.required") };
const notNegative = { error: () => word("reports.errors.negative") };
const maxChars = (max: number) => ({
  error: () => word("reports.errors.maxChars", { max }),
});

export const reportZodSchema = z.object({
  start_date: z
    .string()
    .min(1, { error: () => word("reports.errors.startDateRequired") }),
  mock_interviews_count: z.number(required).min(0, notNegative),
  linkedin_posts_count: z.number(required).min(0, notNegative),
  strategic_connections_count: z.number(required).min(0, notNegative),
  biggest_win: z
    .string()
    .min(1, { error: () => word("reports.errors.winRequired") })
    .max(WIN_MAX, maxChars(WIN_MAX)),
  biggest_challenge: z
    .string()
    .min(1, { error: () => word("reports.errors.challengeRequired") })
    .max(CHALLENGE_MAX, maxChars(CHALLENGE_MAX)),
  next_fortnight_goal: z
    .string()
    .min(1, { error: () => word("reports.errors.goalRequired") })
    .max(GOAL_MAX, maxChars(GOAL_MAX)),
});

export type ReportFormType = z.infer<typeof reportZodSchema>;
