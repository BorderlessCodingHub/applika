import { api } from "@/lib/api-client";
import type { ISessionService } from "@/services/interfaces/i-session-service";
import type {
  RevokeOthersResult,
  UserSession,
} from "@/services/types/sessions";

/** The caller's devices (KODI-058, ADR-0019): `/users/me/sessions`. */
export class SessionService implements ISessionService {
  /** Server order: active by last use, then ended within 30 days. */
  list(): Promise<UserSession[]> {
    return api.get<UserSession[]>("/users/me/sessions").then((r) => r.data);
  }

  /** 204; an ended row is a no-op 204; the current row also clears both cookies. */
  revoke(id: string): Promise<void> {
    return api
      .delete(`/users/me/sessions/${encodeURIComponent(id)}`)
      .then(() => undefined);
  }

  revokeOthers(): Promise<RevokeOthersResult> {
    return api
      .post<RevokeOthersResult>("/users/me/sessions/revoke-others")
      .then((r) => r.data);
  }
}
