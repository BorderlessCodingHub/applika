import type {
  CreateTimelineEventPayload,
  TimelineEvent,
  UpdateTimelineEventPayload,
} from "@/services/types/timeline";

/**
 * Application timeline service (PRD 0008, ADR 0012). CRUD for the events of a
 * single application via `/applications/{id}/timeline`. Every request rides the
 * shared axios instance with `withCredentials`, so the httpOnly auth cookies
 * travel automatically — a screen only ever touches its own applications
 * (cross-user access → 404). Writes against an archived/closed application
 * reject with 409 server-side; this layer just maps HTTP to typed results.
 */
export interface ITimelineService {
  /**
   * List one application's timeline events, ordered `event_date`, `start_time`
   * NULLS FIRST, `created_at` (`GET /applications/{id}/timeline`); 404 if the
   * application is not owned.
   */
  list(applicationId: string): Promise<TimelineEvent[]>;
  /**
   * Create an event (`POST /applications/{id}/timeline`, 201). Interviews carry
   * `interview_type`; offers carry the salary trio; every other type omits
   * both. 404 if not owned; 409 if the application is archived or closed.
   */
  create(
    applicationId: string,
    payload: CreateTimelineEventPayload,
  ): Promise<TimelineEvent>;
  /**
   * Replace an event in full (`PUT /applications/{id}/timeline/{event_id}`) —
   * the body is the complete event, not a patch. 404 if not owned; 409 if
   * archived or closed.
   */
  update(
    applicationId: string,
    eventId: string,
    payload: UpdateTimelineEventPayload,
  ): Promise<TimelineEvent>;
  /**
   * Delete an event (`DELETE /applications/{id}/timeline/{event_id}`, 204);
   * 404 if not owned, 409 if archived or closed.
   */
  remove(applicationId: string, eventId: string): Promise<void>;
}
