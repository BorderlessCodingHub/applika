import { Suspense } from "react";
import { ApplicationsPage } from "./applications-page";

/**
 * The page reads `?focus=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright, so the boundary is the route, not a
 * nicety — see `(protected)/cvs/editor/page.tsx`, the precedent.
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          aria-busy
          aria-label="Loading applications"
          className="h-64 w-full animate-pulse rounded-xl bg-muted"
        />
      }
    >
      <ApplicationsPage />
    </Suspense>
  );
}
