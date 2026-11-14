import { Suspense } from "react";

import { JobListSkeleton } from "@/components/jobs/job-list-states";
import { JobsPage } from "./jobs-page";

/**
 * `/jobs` — the job board (PRD 0012). The filters live in the URL and the
 * page reads them with `useSearchParams`, which suspends: under
 * `output: "export"` the boundary is required, not a nicety.
 */
export default function Page() {
  return (
    <Suspense fallback={<JobListSkeleton />}>
      <JobsPage />
    </Suspense>
  );
}
