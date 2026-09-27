export interface Platform {
  id: string;
  name: string;
  /** `null` when nobody gave it a URL (PRD 0010) — every list renders it without error. */
  url: string | null;
  /** `false` for a row only its creator sees, until an admin publishes it (PRD 0010). */
  is_public: boolean;
}

/**
 * `GET /supports` (PRD 0008, ADR 0012, R-021). The backend still returns
 * `steps`/`feedbacks` on the wire — frozen for CLI 0.1.4 — but the web no
 * longer models or reads them: step/feedback definitions are gone from the
 * product, replaced by the timeline's hardcoded event/interview types.
 */
export interface Supports {
  platforms: Platform[];
}
