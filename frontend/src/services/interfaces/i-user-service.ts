import type { User, UpdateUserPayload } from "@/services/types/users";

export interface IUserService {
  getMe(): Promise<User>;
  updateMe(data: UpdateUserPayload): Promise<User>;
}
