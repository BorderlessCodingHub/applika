export type FeedbackScore = 1 | 2 | 3 | 4 | 5;

export interface FeedbackPayload {
  score: FeedbackScore;
  text?: string;
}
