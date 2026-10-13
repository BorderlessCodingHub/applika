import { Suspense } from "react";

import { JobDetailSkeleton } from "@/components/jobs/job-detail-view";
import { JobViewPage } from "./job-view-page";

/** `/jobs/view?id=` — one job (R-012). Suspense for `useSearchParams` (static export). */
export default function Page() {
  return (
    <Suspense fallback={<JobDetailSkeleton />}>
      <JobViewPage />
    </Suspense>
  );
}
