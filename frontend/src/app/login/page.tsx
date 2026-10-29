import { Suspense } from "react";
import { LoginPage } from "./login-page";

/**
 * The sign-in page reads `?cli=1` with `useSearchParams`, which suspends.
 * Under `output: "export"` a page that reads search params without a
 * Suspense boundary fails the build, so the boundary is the route.
 */
export default function Page() {
  return (
    <Suspense
      fallback={<div aria-busy className="min-h-viewport bg-background" />}
    >
      <LoginPage />
    </Suspense>
  );
}
