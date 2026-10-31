import { Suspense } from "react";
import {
  ApplicationCvPage,
  ApplicationCvPageFallback,
} from "./application-cv-page";

/**
 * `/applications/cv?id=` — the application's CV copy.
 *
 * The component reads `?id=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright, so the boundary is the route, not a
 * nicety. Precedent: `(protected)/cvs/editor/page.tsx`.
 */
export default function Page() {
  return (
    <Suspense fallback={<ApplicationCvPageFallback />}>
      <ApplicationCvPage />
    </Suspense>
  );
}
