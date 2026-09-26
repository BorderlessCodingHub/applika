import { api } from "@/lib/api-client";
import type {
  IPlatformService,
  NewPlatformPayload,
} from "@/services/interfaces/i-platform-service";
import type { Platform } from "@/services/types/supports";

export class PlatformService implements IPlatformService {
  create(data: NewPlatformPayload): Promise<Platform> {
    return api.post<Platform>("/platforms", data).then((r) => r.data);
  }
}
