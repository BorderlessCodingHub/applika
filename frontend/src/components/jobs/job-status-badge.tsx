import Link from "next/link";
import { CircleCheckIcon, FilePenLineIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { JOBS_COPY, jobApplicationHref } from "@/components/jobs/job-copy";
import type { JobApplicationRef } from "@/services/types/jobs";
import { cn } from "@/lib/utils";

export interface JobStatusBadgeProps {
  application: JobApplicationRef;
  /** Id of the job's title: the link's name stays "Draft"/"Applied", the title describes it. */
  describedBy?: string;
  className?: string;
}

/** R-030: "Draft" resumes the draft, "Applied" opens it in the applications list. */
export function JobStatusBadge({
  application,
  describedBy,
  className,
}: JobStatusBadgeProps) {
  const isDraft = application.is_draft;
  const Icon = isDraft ? FilePenLineIcon : CircleCheckIcon;

  return (
    <Badge
      asChild
      variant="outline"
      data-slot="job-status-badge"
      data-status={isDraft ? "draft" : "applied"}
      className={cn(
        "h-7 gap-1.5 rounded-full px-2.5 text-xs underline-offset-2 hover:underline [&>svg]:size-3.5",
        isDraft
          ? "bg-surface-elevated [&>svg]:text-primary"
          : "border-transparent bg-success/10 [&>svg]:text-success",
        className,
      )}
    >
      <Link
        href={jobApplicationHref(application)}
        aria-describedby={describedBy}
      >
        <Icon aria-hidden />
        {isDraft ? JOBS_COPY.draft : JOBS_COPY.applied}
      </Link>
    </Badge>
  );
}
