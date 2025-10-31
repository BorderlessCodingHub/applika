import { getServerSession } from "next-auth";
import { verifyAuth } from "./verifyAuth";

export async function getSession() {
  return await getServerSession(verifyAuth);
}
