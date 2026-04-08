export interface IAuthService {
  refresh(): Promise<{detail: string}>
  logout(): Promise<{detail: string}>
}