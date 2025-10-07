import { z } from "zod";

// Single item schemas
export const feedbackDefinitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
});

export const stepDefinitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  strict: z.boolean(),
});

export const platformSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
});

// Full supports response
export const supportSchema = z.object({
  feedbacks: z.array(feedbackDefinitionSchema),
  steps: z.array(stepDefinitionSchema),
  platforms: z.array(platformSchema),
});

// TypeScript types
export type FeedbackDefinition = z.infer<typeof feedbackDefinitionSchema>;
export type StepDefinition = z.infer<typeof stepDefinitionSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type SupportResponse = z.infer<typeof supportSchema>;
