import type { IFeedbackService } from "../interfaces/i-feedback-service";
import { FeedbackPayload } from "../types/feedbacks";
import { api } from "@/lib/api-client";

export class FeedbackService implements IFeedbackService {
  create(data: FeedbackPayload): Promise<void> {
    return api.post("/feedbacks", data);
  }
}
