"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";

export function useResumes() {
  return useQuery({
    queryKey: ["resumes"],
    queryFn: () => services.jobs.getResumes(),
  });
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => services.jobs.uploadResume(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Resume uploaded");
    },
    onError: () => toast.error("Upload failed"),
  });
}

export function useSetDefaultResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) =>
      services.jobs.setDefaultResume(resumeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Default resume updated");
    },
    onError: () => toast.error("Failed to update"),
  });
}

export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => services.jobs.deleteResume(resumeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Resume deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });
}
