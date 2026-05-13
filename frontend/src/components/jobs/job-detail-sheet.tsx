"use client";

import { useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useJobDetail, useCreateApplicationFromJob } from "@/hooks/use-jobs";
import { TailorCvDialog } from "./tailor-cv-dialog";

interface JobDetailSheetProps {
  jobId: string;
  onClose: () => void;
}

export function JobDetailSheet({ jobId, onClose }: JobDetailSheetProps) {
  const [tailorOpen, setTailorOpen] = useState(false);
  const { data: job, isLoading } = useJobDetail(jobId);
  const createApp = useCreateApplicationFromJob();

  function fitColor(score: number | null) {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-green-600 dark:text-green-400";
    if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full max-w-lg overflow-y-auto p-0 sm:max-w-xl">
            <div className="p-6">
              {isLoading && (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {job && (
                <div className="space-y-5">
                  <SheetHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <SheetTitle className="text-xl">{job.title}</SheetTitle>
                        <p className="text-muted-foreground">
                          {job.company_name}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={onClose}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </SheetHeader>

                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>{job.location_text}</span>
                    {job.employment_type && <span>· {job.employment_type}</span>}
                    {job.posted_at && (
                      <span>
                        ·{" "}
                        {formatDistanceToNow(new Date(job.posted_at), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </div>

                  {job.salary_text && (
                    <p className="text-sm font-medium">{job.salary_text}</p>
                  )}

                  {job.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {job.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {job.fit_score !== null && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          fitColor(job.fit_score),
                        )}
                      >
                        {job.fit_score}% fit
                      </p>
                      {job.matched_keywords.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Matched
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {job.matched_keywords.map((k) => (
                              <Badge
                                key={k}
                                variant="outline"
                                className="text-xs border-green-500/50 text-green-700 dark:text-green-300"
                              >
                                {k}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {job.missing_keywords.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Missing
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {job.missing_keywords.map((k) => (
                              <Badge
                                key={k}
                                variant="outline"
                                className="text-xs border-red-500/50 text-red-700 dark:text-red-300"
                              >
                                {k}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <hr className="border-border" />

                  <div>
                    <p className="text-sm font-medium mb-2">Description</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {job.description_text}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        View Job
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTailorOpen(true)}
                    >
                      Tailor CV
                    </Button>
                    <Button
                      size="sm"
                      disabled={createApp.isPending}
                      onClick={() => createApp.mutate(jobId)}
                    >
                      {createApp.isPending && (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      )}
                      Add to Applications
                    </Button>
                  </div>
                </div>
              )}
            </div>
        </SheetContent>
      </Sheet>

      {tailorOpen && (
        <TailorCvDialog
          open={tailorOpen}
          onOpenChange={setTailorOpen}
          jobId={jobId}
        />
      )}
    </>
  );
}
