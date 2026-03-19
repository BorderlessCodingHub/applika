import { api } from "@/lib/api-client";
import type { IUserService } from "@/services/interfaces/i-user-service";
import type { User, UpdateUserPayload } from "@/services/types/users";

export class UserService implements IUserService {
  getMe(): Promise<User> {
    return api.get<User>("/users/me").then((r) => r.data);
  }

  updateMe(data: UpdateUserPayload): Promise<User> {
    return api.patch<User>("/users/me", data).then((r) => r.data);
  }
}
