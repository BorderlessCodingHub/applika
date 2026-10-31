import { Suspense } from "react";
import { CvEditorPage, CvEditorRouteFallback } from "./cv-editor-page";

/**
 * The editor reads `?id=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright, so the boundary is the route, not a nicety.
 */
export default function Page() {
  return (
    <Suspense fallback={<CvEditorRouteFallback />}>
      <CvEditorPage />
    </Suspense>
  );
}
