"use client";

import { useSearchParams } from "next/navigation";

import { CliCodeScreen } from "@/components/cli-code/cli-code-screen";

/** Shows `<code>#<state>` read-only for the user to paste into the CLI (R-019). */
export function CliCodePage() {
  const searchParams = useSearchParams();
  return (
    <CliCodeScreen
      code={searchParams.get("code")}
      state={searchParams.get("state")}
    />
  );
}
