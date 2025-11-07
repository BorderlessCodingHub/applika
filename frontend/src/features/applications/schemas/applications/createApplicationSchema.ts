import { baseApplicationSchema } from "./applicationBaseSchema";
import { z } from "zod";
import { APPLICATION_MODES } from "@/domain/constants/application";

export const createApplicationSchema = baseApplicationSchema.extend({
  platform_id: z.preprocess(
    (val) => Number(val),
    z.number().int().positive("Platform is required")
  ),
  mode: z.preprocess(
    (val) => (!val ? undefined : val),
    z.enum(APPLICATION_MODES.map((m) => m.id) as [string, ...string[]], {
      message: "Mode is required",
    })
  ),
});

export type CreateApplicationPayload = z.infer<typeof createApplicationSchema>;
