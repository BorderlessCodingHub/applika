import { cookies } from "next/headers";

export async function verifyAuth(): Promise<boolean> {
  try {
    const cookieStore = cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
      method: "GET",
      headers: { Cookie: cookieHeader },
      cache: "no-store",
      credentials: "include",
    });

    return res.ok;
  } catch {
    return false;
  }
}
