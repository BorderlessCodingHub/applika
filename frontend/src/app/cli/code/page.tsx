import { Suspense } from "react";
import { CliCodePage } from "./cli-code-page";

/**
 * `/cli/code?code=&state=` (KODI-058): the API's 307 lands here when the CLI
 * cannot reach its local callback. Outside the route groups like `/login`:
 * no shell, no sign-in. `useSearchParams` needs this Suspense boundary under
 * `output: "export"`.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CliCodePage />
    </Suspense>
  );
}
