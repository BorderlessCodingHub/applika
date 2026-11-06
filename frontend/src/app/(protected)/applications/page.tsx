import { Suspense } from "react";
import {
  ApplicationsPage,
  ApplicationsPageFallback,
} from "./applications-page";

/**
 * The page reads `?focus=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright, so the boundary is the route, not a
 * nicety — see `(protected)/cvs/editor/page.tsx`, the precedent.
 */
export default function Page() {
  return (
    <Suspense fallback={<ApplicationsPageFallback />}>
      <ApplicationsPage />
    </Suspense>
  );
}
