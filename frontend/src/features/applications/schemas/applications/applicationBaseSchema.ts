import { z } from "zod";

export const baseApplicationSchema = z.object({
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  mode: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.enum(["active", "passive"], { message: "Mode is required" })
  ),
  platform_id: z.preprocess(
    (val) => Number(val),
    z.number().int().positive("Platform is required")
  ),
  application_date: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  observation: z.string().optional(),
  expected_salary: z
    .preprocess(
      (val) => (val === "" ? undefined : Number(val)),
      z.number().optional()
    )
    .optional(),
  salary_range_min: z
    .preprocess(
      (val) => (val === "" ? undefined : Number(val)),
      z.number().optional()
    )
    .optional(),
  salary_range_max: z
    .preprocess(
      (val) => (val === "" ? undefined : Number(val)),
      z.number().optional()
    )
    .optional(),
});

export type BaseApplicationFormData = z.infer<typeof baseApplicationSchema>;
