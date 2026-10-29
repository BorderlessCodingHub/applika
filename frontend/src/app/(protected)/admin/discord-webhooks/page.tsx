"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Report webhooks are assigned to a membership badge now and live at
 * `/admin/report-webhooks` (ADR-0024). A saved link to the old path still
 * works through this client-side redirect: the app is a static export, so
 * there is no server-side rewrite.
 */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/report-webhooks");
  }, [router]);

  return null;
}
