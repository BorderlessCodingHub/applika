"use client";

import { useRef } from "react";
import { Loader2, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useDeleteResume,
  useSetDefaultResume,
  useUploadResume,
} from "@/hooks/use-resumes";
import type { UserResume } from "@/services/types/jobs";

interface ResumeUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumes: UserResume[];
}

export function ResumeUploadDialog({
  open,
  onOpenChange,
  resumes,
}: ResumeUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadResume();
  const setDefault = useSetDefaultResume();
  const deleteResume = useDeleteResume();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload.mutateAsync(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Resumes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {resumes.length > 0 && (
            <div className="space-y-2">
              {resumes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(r.byte_size)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {r.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                    {!r.is_default && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDefault.mutate(r.id)}
                        disabled={setDefault.isPending}
                        title="Set as default"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteResume.mutate(r.id)}
                      disabled={deleteResume.isPending}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload Resume (PDF, DOCX, TXT)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
