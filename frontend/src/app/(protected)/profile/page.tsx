import { Suspense } from "react";
import { ProfilePage } from "./profile-page";

/**
 * The page reads `?account=&status=` with `useSearchParams`, which suspends.
 * Under `output: "export"` a page that reads search params WITHOUT a
 * Suspense boundary fails the build outright, so the boundary is the route,
 * not a nicety (precedent: `(protected)/cvs/editor/page.tsx`).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProfilePage />
    </Suspense>
  );
}
