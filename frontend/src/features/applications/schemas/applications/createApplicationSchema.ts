import { baseApplicationSchema } from "./applicationBaseSchema";
import { z } from "zod";

export const createApplicationSchema = baseApplicationSchema.extend({
  platform_id: z.union([z.string(), z.number()]),
  mode: z.enum(["active", "passive"]),
});
export type CreateApplicationPayload = z.infer<typeof createApplicationSchema>;
