import { z } from "zod";

export const applicationFormSchema = z.object({
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  application_date: z.string().min(1, "Date is required"),

  platform_id: z.union([z.string(), z.number()]).optional(), // accepts string (from <select>) and transforms to number
  mode: z.enum(["active", "passive"]).optional(),

  expected_salary: z.preprocess((val) => val === "" ? undefined : Number(val), z.number().optional()),
  salary_range_min: z.preprocess((val) => val === "" ? undefined : Number(val), z.number().optional()),
  salary_range_max: z.preprocess((val) => val === "" ? undefined : Number(val), z.number().optional()),

  observation: z.string().optional(),
});

export type ApplicationFormData = z.infer<typeof applicationFormSchema>;
