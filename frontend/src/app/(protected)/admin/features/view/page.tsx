import { Suspense } from "react";
import { FeatureViewPage, FeatureViewPageFallback } from "./feature-view-page";

/**
 * The feature page reads `?key=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params without a Suspense
 * boundary fails the build, so the boundary is the route (`cvs/editor`).
 */
export default function Page() {
  return (
    <Suspense fallback={<FeatureViewPageFallback />}>
      <FeatureViewPage />
    </Suspense>
  );
}
