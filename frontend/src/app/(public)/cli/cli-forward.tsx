"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { APP_CONFIG } from "@/config";

/** An old `/cli` link opens the MCP page (`replace`: Back skips `/cli`). */
export function CliForward() {
  const router = useRouter();

  useEffect(() => {
    router.replace(APP_CONFIG.mcp.page);
  }, [router]);

  return null;
}
