import { baseApplicationSchema } from "./applicationBaseSchema";
import { z } from "zod";

export const updateApplicationSchema = baseApplicationSchema.partial();
export type UpdateApplicationPayload = z.infer<typeof updateApplicationSchema>;
