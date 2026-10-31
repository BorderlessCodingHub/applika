import { Suspense } from "react";
import { NewWithCvPage, NewWithCvPageFallback } from "./new-with-cv-page";

/**
 * The page reads `?id=`/`?step=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright — see `(protected)/cvs/editor/page.tsx`.
 */
export default function Page() {
  return (
    <Suspense fallback={<NewWithCvPageFallback />}>
      <NewWithCvPage />
    </Suspense>
  );
}
