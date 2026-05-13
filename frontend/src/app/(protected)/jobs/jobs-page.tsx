"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobList } from "@/components/jobs/job-list";
import { JobDetailSheet } from "@/components/jobs/job-detail-sheet";
import { ResumeUploadDialog } from "@/components/jobs/resume-upload-dialog";
import { useJobs } from "@/hooks/use-jobs";
import { useResumes } from "@/hooks/use-resumes";

export function JobsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const {
    jobs,
    total,
    page,
    pageSize,
    isLoading,
    filters,
    updateFilter,
    clearFilters,
  } = useJobs();

  const { data: resumes } = useResumes();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">Opportunities</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Resume
        </Button>
      </div>

      <JobFilters
        filters={filters}
        onFilterChange={updateFilter}
        onClear={clearFilters}
        hasResume={!!resumes?.length}
      />

      <JobList
        jobs={jobs}
        total={total}
        page={page}
        pageSize={pageSize}
        isLoading={isLoading}
        onSelectJob={setSelectedJobId}
        onPageChange={(p) => updateFilter("page", p)}
      />

      {selectedJobId && (
        <JobDetailSheet
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      <ResumeUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        resumes={resumes ?? []}
      />
    </div>
  );
}
