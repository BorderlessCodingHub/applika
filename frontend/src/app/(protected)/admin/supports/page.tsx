"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * `/admin/supports` moved to `/admin/platforms` (PRD 0010, KODI-035): the
 * step/feedback definition catalogs are gone (PRD 0008/ADR 0012, R-021) and
 * platforms are now paginated with an application count, like companies. A
 * saved link to the old path still works via this client-side redirect —
 * this is a static export, so there is no server-side rewrite.
 */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/platforms");
  }, [router]);

  return null;
}
