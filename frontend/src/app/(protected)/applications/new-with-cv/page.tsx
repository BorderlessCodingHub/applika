import { Suspense } from "react";
import { NewWithCvPage } from "./new-with-cv-page";

/**
 * The page reads `?id=`/`?step=` with `useSearchParams`, which suspends. Under
 * `output: "export"` a page that reads search params WITHOUT a Suspense
 * boundary fails the build outright — see `(protected)/cvs/editor/page.tsx`.
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div
          aria-busy
          aria-label="Loading the new application page"
          className="h-64 w-full animate-pulse rounded-xl bg-muted"
        />
      }
    >
      <NewWithCvPage />
    </Suspense>
  );
}
