import { Suspense } from "react";
import { DevicePage } from "./device-page";

/**
 * `/device?code=XXXX-XXXX`: where `applika login --device` sends
 * the user. `useSearchParams` suspends, and `output: "export"` fails the
 * build without this boundary (precedent: `(protected)/cvs/editor/page.tsx`).
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DevicePage />
    </Suspense>
  );
}
