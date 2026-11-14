import { api } from "@/lib/api-client";
import type { IFeatureService } from "@/services/interfaces/i-feature-service";
import type { MyFeature, MyFeaturesResponse } from "@/services/types/features";

export class FeatureService implements IFeatureService {
  getMine(): Promise<MyFeature[]> {
    return api
      .get<MyFeaturesResponse>("/users/me/features")
      .then((r) => r.data.features);
  }
}
