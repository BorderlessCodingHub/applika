import { cookies } from "next/headers";

export async function getSession() {
  const cookieStore = cookies();

  const access =
    (await cookieStore.get("access_token"))?.value ??
    (await cookieStore.get("__access"))?.value ??
    null;

  const refresh =
    (await cookieStore.get("refresh_token"))?.value ??
    (await cookieStore.get("__refresh"))?.value ??
    null;

  return { access, refresh };
}
