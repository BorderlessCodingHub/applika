// src/lib/authFetcher.ts
import { redirect } from "next/navigation";

/**
 * Parses API error responses safely.
 */
export async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const data = await res.clone().json();
    return data.detail || JSON.stringify(data);
  } catch {
    const text = await res.text();
    return text || "Unknown error occurred";
  }
}

async function trySilentRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (res.ok) {
      console.info("[authFetcher] Silent refresh succeeded");
      return true;
    }

    console.warn(
      `[authFetcher] Silent refresh failed with status: ${res.status}`
    );
    return false;
  } catch (err) {
    console.error("[authFetcher] Silent refresh error:", err);
    return false;
  }
}

/**
 * Handles token expiration consistently across services.
 * It triggers backend logout (server clears HttpOnly cookies)
 * and redirects to /login.
 */
export async function handleUnauthorized(): Promise<never> {
  try {
    // Ask backend to clear auth cookies (HttpOnly)
    await fetch("/api/auth/logout", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Ignore network errors; redirect anyway
  }

  if (typeof window !== "undefined") {
    window.location.href = "/login";
  } else {
    redirect("/login");
  }

  throw new Error("Unauthorized - redirecting to login");
}

/**
 * A drop-in replacement for native fetch with 401 auto-handling.
 */
export async function authFetcher<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    ...init,
  });

  if (res.status === 401) {
    const msg = await parseErrorResponse(res);
    console.warn(`[authFetcher] 401 Unauthorized: ${msg}`);

    const refreshed = await trySilentRefresh();

    if (!refreshed) {
      await handleUnauthorized();
    }

    const retryRes = await fetch(input, {
      credentials: "include",
      ...init,
    });

    if (!retryRes.ok) {
      const retryMsg = await parseErrorResponse(retryRes);
      throw new Error(retryMsg);
    }

    return retryRes.json();
  }

  if (!res.ok) {
    const msg = await parseErrorResponse(res);
    throw new Error(msg);
  }

  return res.json();
}
