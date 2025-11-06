import { redirect } from "next/navigation";

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

export async function handleUnauthorized(): Promise<never> {
  try {
    await fetch("/api/auth/logout", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch (err) {
    console.error("[authFetcher] Logout error:", err);
  }

  if (typeof window !== "undefined") {
    window.location.href = "/login";
  } else {
    redirect("/login");
  }

  throw new Error("Unauthorized - redirecting to login");
}

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

  return safeJsonParse<T>(res);
}

async function safeJsonParse<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text) return true as T;
  if (text.trim() === "true") return true as T;
  if (text.trim() === "false") return false as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
