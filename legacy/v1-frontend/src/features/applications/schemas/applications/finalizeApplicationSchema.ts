import { z } from "zod";

export const finalizeApplicationSchema = z.object({
  step_id: z.number().int().positive("Result is required"),
  feedback_id: z.number().int().positive("Feedback is required"),
  finalize_date: z.string().min(1, "Finalize date is required"),
  salary_offer: z
    .preprocess(
      (val) => (!val ? undefined : Number(val)),
      z.number().optional()
    )
    .optional(),
  observation: z.string().optional(),
});
export type FinalizeApplicationPayload = z.infer<
  typeof finalizeApplicationSchema
>;
