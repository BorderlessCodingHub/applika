import z from "zod";

// ─── Constants ──────────────────────────────────────────────────────────────

export const WIN_MAX = 280;
export const CHALLENGE_MAX = 280;
export const GOAL_MAX = 500;

// ─── Schema ─────────────────────────────────────────────────────────────────

export const reportZodSchema = z.object({
  start_date: z.string().min(1, "Start date is required"),
  mock_interviews_count: z
    .number({ error: "Required" })
    .min(0, "Cannot be negative"),
  linkedin_posts_count: z
    .number({ error: "Required" })
    .min(0, "Cannot be negative"),
  strategic_connections_count: z
    .number({ error: "Required" })
    .min(0, "Cannot be negative"),
  biggest_win: z
    .string()
    .min(1, "Biggest win is required")
    .max(WIN_MAX, `Maximum ${WIN_MAX} characters exceeded`),
  biggest_challenge: z
    .string()
    .min(1, "Biggest challenge is required")
    .max(CHALLENGE_MAX, `Maximum ${CHALLENGE_MAX} characters exceeded`),
  next_fortnight_goal: z
    .string()
    .min(1, "Next fortnight goal is required")
    .max(GOAL_MAX, `Maximum ${GOAL_MAX} characters exceeded`),
});

export type ReportFormType = z.infer<typeof reportZodSchema>;
