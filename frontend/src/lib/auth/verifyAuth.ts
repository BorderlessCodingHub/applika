import { getSession } from "./getSession";

export async function verifyAuth() {
  const { access } = await getSession();
  return Boolean(access);
}
