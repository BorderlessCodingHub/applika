import { api } from "@/lib/api-client";
import type { IUserService } from "@/services/interfaces/i-user-service";
import type { AgendaStep } from "@/services/types/applications";
import type { User, UpdateUserPayload } from "@/services/types/users";

export class UserService implements IUserService {
  getMe(): Promise<User> {
    return api.get<User>("/users/me").then((r) => r.data);
  }

  updateMe(data: UpdateUserPayload): Promise<User> {
    return api.patch<User>("/users/me", data).then((r) => r.data);
  }

  deleteMe(): Promise<void> {
    return api.delete("/users/me").then(() => undefined);
  }

  getAgenda(params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<AgendaStep[]> {
    return api
      .get<AgendaStep[]>("/users/me/agenda", { params })
      .then((r) => r.data);
  }
}
