import axios, { AxiosError } from "axios";
import { APP_CONFIG } from "@/config";
import { apiErrorMessage } from "@/lib/api-error-message";
import { recordRefusedRefresh } from "@/lib/session-ended";
import { services } from "@/services/services";

export const api = axios.create({
  baseURL: APP_CONFIG.envs.apiBaseURL,
  withCredentials: true,
});

/**
 * The words for a refused request, in the active language: the error's
 * `code` looked up in the messages (with its `params`), else the API's
 * English `detail`, else the generic line (`lib/api-error-message.ts`).
 */
export function getApiError(error: AxiosError): string {
  return apiErrorMessage(error.response?.data);
}

/**
 * A 401 on `/auth/*` is final (a failed `/auth/refresh` must never trigger
 * another refresh). Signed-in calls that merely live under `/auth/` refresh
 * and retry like any other page: the device approval routes and the GitHub
 * restore start.
 */
function refreshesOn401(error: AxiosError): boolean {
  const url = error.config?.url;
  if (!url) return true;
  if (!url.includes("/auth/")) return true;
  return url.includes("/auth/device/") || url.includes("/auth/github/restore");
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}> = [];

const processQueue = (error: unknown | null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(undefined);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      refreshesOn401(error)
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      // A refresh refused with 503 (the session store is down, KODI-057)
      // rejects with that 503: callers see a temporary error (`isTemporary`)
      // and retry; nothing here signs the user out.
      try {
        await services.auth.refresh();
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        // AUTH-1049 (Borderless refused the grant) ends the session here as
        // it does in AuthProvider's poll: the sign-in page shows its words.
        recordRefusedRefresh(refreshError);
        processQueue(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);
