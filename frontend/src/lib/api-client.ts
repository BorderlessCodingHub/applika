import axios, { AxiosError } from "axios";
import { APP_CONFIG } from "@/config";
import { services } from "@/services/services";

export const api = axios.create({
  baseURL: APP_CONFIG.envs.apiBaseURL,
  withCredentials: true,
});

export function getApiError(error: AxiosError) {
  if (!error.response?.data) return "Something went wrong";

  const errorData = error.response.data as { detail: string };
  return errorData.detail;
}

/**
 * A 401 on `/auth/*` is final (a failed `/auth/refresh` must never trigger
 * another refresh). The device approval routes (KODI-058) are ordinary
 * signed-in calls that merely live under `/auth/`: an expired access cookie
 * on `/device` refreshes and retries like any other page.
 */
function refreshesOn401(url: string | undefined): boolean {
  if (!url) return true;
  return !url.includes("/auth/") || url.includes("/auth/device/");
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
      refreshesOn401(originalRequest.url)
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
        processQueue(refreshError);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);
