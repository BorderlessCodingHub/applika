import { z } from "zod";

export const finalizeApplicationSchema = z.object({
  step_id: z.number().int().positive(),
  feedback_id: z.number().int().positive(),
  finalize_date: z.string().min(1),
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
