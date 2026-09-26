import type { Platform } from "@/services/types/supports";

export interface NewPlatformPayload {
  name: string;
  url: string | null;
}

export interface IPlatformService {
  /** `GET /platforms?name=` — visible platforms, searched by name (web only). */
  list(name?: string): Promise<Platform[]>;
  /** `POST /platforms` — 201 new, or 409 when an existing visible row matches by name. */
  create(data: NewPlatformPayload): Promise<Platform>;
}
