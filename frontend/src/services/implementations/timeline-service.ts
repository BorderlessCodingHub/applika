import { api } from "@/lib/api-client";
import type { ITimelineService } from "@/services/interfaces/i-timeline-service";
import type {
  CreateTimelineEventPayload,
  TimelineEvent,
  UpdateTimelineEventPayload,
} from "@/services/types/timeline";

/**
 * Cookie-backed application timeline service (PRD 0008, ADR 0012). The httpOnly
 * `__access` cookie authenticates each call, so this always operates on the
 * acting user's own applications. Ownership scoping and the archived/closed
 * guards are enforced server-side — this layer maps HTTP to typed results.
 */
export class TimelineService implements ITimelineService {
  async list(applicationId: string): Promise<TimelineEvent[]> {
    const { data } = await api.get<TimelineEvent[]>(
      `/applications/${applicationId}/timeline`,
    );
    return data;
  }

  async create(
    applicationId: string,
    payload: CreateTimelineEventPayload,
  ): Promise<TimelineEvent> {
    const { data } = await api.post<TimelineEvent>(
      `/applications/${applicationId}/timeline`,
      payload,
    );
    return data;
  }

  async update(
    applicationId: string,
    eventId: string,
    payload: UpdateTimelineEventPayload,
  ): Promise<TimelineEvent> {
    const { data } = await api.put<TimelineEvent>(
      `/applications/${applicationId}/timeline/${eventId}`,
      payload,
    );
    return data;
  }

  async remove(applicationId: string, eventId: string): Promise<void> {
    await api.delete(`/applications/${applicationId}/timeline/${eventId}`);
  }
}
