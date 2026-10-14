import type { MyFeature } from "@/services/types/features";

/** The caller's own features (PRD 0013, `/users/me/features`). */
export interface IFeatureService {
  /** Only the features the caller has; an absent key means no access. */
  getMine(): Promise<MyFeature[]>;
}
