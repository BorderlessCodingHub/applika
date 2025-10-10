import { z } from "zod";

export const applicationStepSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  step_id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  step_date: z.string().min(1, "Step date is required"),
  step_name: z.string().min(1, "Step name is required"),
  observation: z.string().optional(),
  step_color: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().nullable().optional(),
});

export const updateStepPayloadSchema = z.object({
  step_id: z.union([z.string(), z.number()]),
  step_date: z.string().min(1, "Step date is required"),
  observation: z.string().optional(),
});

export const applicationStepsSchema = z.array(applicationStepSchema);

export type ApplicationStep = z.infer<typeof applicationStepSchema>;

export type UpdateStepPayload = z.infer<typeof updateStepPayloadSchema>;