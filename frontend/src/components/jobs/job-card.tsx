"use client";

import { formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { JobListItem } from "@/services/types/jobs";

interface JobCardProps {
  job: JobListItem;
  onClick: () => void;
}

function FitBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 70
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : score >= 40
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", color)}
    >
      {score}% fit
    </span>
  );
}

export function JobCard({ job, onClick }: JobCardProps) {
  const relativeDate = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight">{job.title}</p>
            <p className="text-sm text-muted-foreground">{job.company_name}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="outline" className="text-xs capitalize">
              {job.source_code}
            </Badge>
            <FitBadge score={job.fit_score} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location_text}
          </span>
          {job.salary_text && <span>{job.salary_text}</span>}
          {relativeDate && <span>{relativeDate}</span>}
        </div>

        {job.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {job.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {job.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{job.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
