import { Suspense } from "react";
import { FeatureViewPage } from "./feature-view-page";

/**
 * The feature page reads `?key=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params without a Suspense
 * boundary fails the build, so the boundary is the route (`cvs/editor`).
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          aria-busy
          aria-label="Loading feature"
          className="h-64 w-full animate-pulse rounded-xl bg-muted"
        />
      }
    >
      <FeatureViewPage />
    </Suspense>
  );
}
