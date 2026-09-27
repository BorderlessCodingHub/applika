import { api } from "@/lib/api-client";
import type {
  IPlatformService,
  NewPlatformPayload,
} from "@/services/interfaces/i-platform-service";
import type { Platform } from "@/services/types/supports";

export class PlatformService implements IPlatformService {
  list(name?: string): Promise<Platform[]> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return api.get<Platform[]>(`/platforms${query}`).then((r) => r.data);
  }

  create(data: NewPlatformPayload): Promise<Platform> {
    return api.post<Platform>("/platforms", data).then((r) => r.data);
  }
}
