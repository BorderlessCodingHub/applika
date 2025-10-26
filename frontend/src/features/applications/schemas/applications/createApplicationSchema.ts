import { baseApplicationSchema } from "./applicationBaseSchema";
import { z } from "zod";

export const createApplicationSchema = baseApplicationSchema.extend({
  platform_id: z.preprocess(
    (val) => Number(val),
    z.number().int().positive("Platform is required")
  ),
  mode: z.enum(["active", "passive"]),
});

export type CreateApplicationPayload = z.infer<typeof createApplicationSchema>;
