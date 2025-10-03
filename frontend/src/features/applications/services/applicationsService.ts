import type { Application } from "../steps/types";

export async function fetchApplications(): Promise<Application[]> {
  const res = await fetch("/api/applications", {
    credentials: "include", // ensures cookies are sent
  });

  if (!res.ok) {
    throw new Error("Failed to fetch applications");
  }

  return res.json();
}
