import Link from "next/link";
import { ArrowRightIcon, TargetIcon } from "lucide-react";

import { JOBS_COPY, NEW_MASTER_CV_HREF } from "@/components/jobs/job-copy";
import { cn } from "@/lib/utils";

/** R-015: shown instead of any fit while the user has no master CV. The whole banner is the link. */
export function MasterCvInvitation({ className }: { className?: string }) {
  return (
    <Link
      href={NEW_MASTER_CV_HREF}
      data-slot="master-cv-invitation"
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground transition-colors outline-none hover:border-primary hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
        <TargetIcon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-pretty">{JOBS_COPY.invitation}</span>
      <ArrowRightIcon
        aria-hidden
        className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}
