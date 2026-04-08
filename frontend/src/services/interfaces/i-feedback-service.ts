import type { FeedbackPayload } from "../types/feedbacks";

export interface IFeedbackService {
  create(data: FeedbackPayload): Promise<void>;
}
