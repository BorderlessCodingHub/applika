/**
 * Beta features (PRD 0013, KODI-052 `GET /users/me/features`). A key the
 * caller does not get back is a feature they do not have: the API is the
 * rule, the web only hides what the server already refuses.
 */

/** Every gated feature the web knows. A new feature adds its key here. */
export type FeatureKey = "jobs";

/** `beta` shows the "Beta" label to the users who have it; `general` does not. */
export type FeatureStage = "beta" | "general";

export interface MyFeature {
  key: FeatureKey;
  stage: FeatureStage;
}

export interface MyFeaturesResponse {
  features: MyFeature[];
}

// ── Admin (KODI-052 `/admin/features*`, KODI-054) ──────────────────────

/** Why the calling admin has a feature; `null` when they do not (they turned it off). */
export type AdminFeatureVia = "general" | "list" | "admin";

/** `me` on a `GET /admin/features` row: the calling admin's own access (R-016, R-017). */
export interface AdminFeatureMe {
  has: boolean;
  via: AdminFeatureVia | null;
  /** The stored choice: kept in either stage, counts only in beta. */
  opted_out: boolean;
}

/** `GET /admin/features` row. No `id`: `key` is the identity in URLs and React keys. */
export interface AdminFeature {
  key: string;
  name: string;
  description: string | null;
  stage: FeatureStage;
  /** Users on the beta list; admins who have it only as admins are not counted. */
  beta_user_count: number;
  released_at: string | null;
  updated_at: string;
  me: AdminFeatureMe;
}

/** `GET /admin/features/{key}/users` item, newest first. */
export interface AdminFeatureUser {
  user_id: string;
  username: string;
  email: string;
  added_at: string;
  /** `null` when the adder is gone or was not recorded. */
  added_by: { id: string; username: string } | null;
}

export interface AdminFeatureUsersPage {
  items: AdminFeatureUser[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface AdminFeatureUsersParams {
  /** Username contains, ≤ 100 characters. */
  search?: string;
  page?: number;
  /** 1..100, the API's default is 25. */
  per_page?: number;
}
