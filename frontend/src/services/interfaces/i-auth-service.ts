export interface IAuthService {
  refresh(): Promise<void>
  logout(): Promise<void>
}