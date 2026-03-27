import { IAuthService } from "../interfaces/i-auth-service";
import { api } from "@/lib/api-client";

export class AuthService implements IAuthService {
  refresh(): Promise<void> {
    return api.get("/auth/refresh");
  }
  logout(): Promise<void> {
    return api.get("/auth/logout");
  }
}
