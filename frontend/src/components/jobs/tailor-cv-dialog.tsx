"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AtsReportDisplay } from "./ats-report";
import { useTailorCv } from "@/hooks/use-jobs";
import { useResumes } from "@/hooks/use-resumes";
import type { TailoredDocument } from "@/services/types/jobs";
import { toast } from "sonner";

interface TailorCvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
}

export function TailorCvDialog({
  open,
  onOpenChange,
  jobId,
}: TailorCvDialogProps) {
  const [result, setResult] = useState<TailoredDocument | null>(null);
  const { data: resumes } = useResumes();
  const defaultResume = resumes?.find((r) => r.is_default);

  const mutation = useTailorCv(jobId);

  async function handleTailor() {
    const doc = await mutation.mutateAsync();
    setResult(doc);
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result.plain_text);
      toast.success("Copied to clipboard");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tailor CV</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            {defaultResume ? (
              <p className="text-sm text-muted-foreground">
                Using resume: <strong>{defaultResume.filename}</strong>
              </p>
            ) : (
              <p className="text-sm text-destructive">
                No resume uploaded. Please upload a resume first.
              </p>
            )}
            <Button
              onClick={handleTailor}
              disabled={!defaultResume || mutation.isPending}
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Tailor CV
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {result.ats_report && (
              <AtsReportDisplay report={result.ats_report} />
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">CV Preview</p>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
              <div className="h-64 overflow-y-auto rounded-md border p-3">
                <pre className="whitespace-pre-wrap text-xs">
                  {result.plain_text}
                </pre>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
