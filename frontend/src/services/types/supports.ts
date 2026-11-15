export interface Platform {
  id: string;
  name: string;
  /** `null` when nobody gave it a URL (PRD 0010) — every list renders it without error. */
  url: string | null;
  /** `false` for a row only its creator sees, until an admin publishes it (PRD 0010). */
  is_public: boolean;
}

/**
 * `GET /supports` (PRD 0008, ADR 0012, R-021): the platforms only. The
 * `steps`/`feedbacks` only applika-cli read left the answer with the CLI
 * (ADR-0028); the timeline's hardcoded event/interview types replaced them.
 */
export interface Supports {
  platforms: Platform[];
}
