import { z } from "zod";

const baseReportSubmitSchema = z.object({
  mock_interviews_count: z
    .number()
    .min(0, "Mock interviews count must be 0 or greater"),
  linkedin_posts_count: z
    .number()
    .min(0, "LinkedIn posts count must be 0 or greater"),
  strategic_connections_count: z
    .number()
    .min(0, "Strategic connections count must be 0 or greater"),
  biggest_win: z
    .string()
    .min(1, "Biggest win is required")
    .max(280, "Biggest win must be 280 characters or less"),
  biggest_challenge: z
    .string()
    .min(1, "Biggest challenge is required")
    .max(280, "Biggest challenge must be 280 characters or less"),
  next_fortnight_goal: z
    .string()
    .min(1, "Next fortnight goal is required")
    .max(500, "Next fortnight goal must be 500 characters or less"),
});

const startDateSchema = z
  .string()
  .min(1, "Start date is required")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid calendar date")
  .refine((value) => {
    const today = new Date();
    const [year, month, day] = value.split("-").map(Number);
    const inputDate = new Date(Date.UTC(year, month - 1, day));
    const todayUtc = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );

    return inputDate <= todayUtc;
  }, "Start date cannot be in the future");

export function createReportSubmitSchema(isDayOne: boolean) {
  return isDayOne
    ? baseReportSubmitSchema.extend({
        start_date: startDateSchema,
      })
    : baseReportSubmitSchema.extend({
        start_date: startDateSchema.optional(),
      });
}

export const reportSubmitSchema = createReportSubmitSchema(false);

export type ReportSubmitSchema = z.infer<
  ReturnType<typeof createReportSubmitSchema>
>;
