import type { AgendaStep } from "@/services/types/applications";
import type { User, UpdateUserPayload } from "@/services/types/users";

export interface IUserService {
  getMe(): Promise<User>;
  updateMe(data: UpdateUserPayload): Promise<User>;
  deleteMe(): Promise<void>;
  getAgenda(params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<AgendaStep[]>;
}
