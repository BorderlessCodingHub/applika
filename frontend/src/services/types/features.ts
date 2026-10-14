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
