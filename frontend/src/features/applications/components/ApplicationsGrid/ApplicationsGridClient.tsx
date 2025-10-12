// src/features/applications/components/ApplicationsGridClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import ApplicationCard from "../ApplicationCard";
import useApplicationModals, {
  useApplications,
  mutateApplications,
  mutateSteps,
} from "../../hooks/useApplicationModals";
import AddStepModal from "../../steps/AddStepModal";
import FinalizeApplicationModal from "../../modals/FinalizeApplicationModal";
import EditApplicationModal from "../../modals/EditApplicationModal";
import DeleteApplicationModal from "../../modals/DeleteApplicationModal";
import EditStepModal from "../../steps/EditStepModal";
import DeleteStepModal from "../../steps/DeleteStepModal";
import type { Application } from "@/features/applications/types";
import type { ApplicationFormData } from "@/features/applications/schemas/applicationSchema";
import {
  finalizeApplication,
  FinalizeApplicationPayload,
  updateApplication,
  UpdateApplicationPayload,
  deleteApplication,
  fetchSupportsPlatforms,
  fetchSupportsResults,
  fetchSupportsFeedbacks,
} from "@/features/applications/services/applicationsService";
import { fetchSupportsSteps } from "@/features/applications/services/applicationStepsService";

interface ApplicationsGridProps {
  applications?: Application[];
}

export default function ApplicationsGrid({
  // applications: initialApplications,
  applications = [],
}: ApplicationsGridProps) {
  const { applications: appsFromHook, error } = useApplications();
  const [localApplications, setLocalApplications] =
    useState<Application[]>(applications);
  //   const [localApplications, setLocalApplications] = useState<Application[]>(
  //   initialApplications || []
  // );
  const modal = useApplicationModals();
  const [isDeleting, setIsDeleting] = useState(false);
  const [steps, setSteps] = useState<{ id: number; name: string }[]>([]);
  const [feedbacks, setFeedbacks] = useState<{ id: number; name: string }[]>(
    []
  );
  const [results, setResults] = useState<{ id: number; name: string }[]>([]);
  const [platforms, setPlatforms] = useState<{ id: number; name: string }[]>(
    []
  );
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);

  // const { applications: apps, error, isValidating } = useApplications();

  const displayedApps = localApplications;

  useEffect(() => {
    setLocalApplications(applications);
  }, [applications]);

  useEffect(() => {
    if (appsFromHook && appsFromHook.length > 0) {
      setLocalApplications(appsFromHook);
    }
  }, [appsFromHook]);

  useEffect(() => {
    async function loadPlatforms() {
      try {
        const data = await fetchSupportsPlatforms();
        setPlatforms(data);
      } catch (err) {
        console.error("Failed to load platforms:", err);
      } finally {
        setLoadingPlatforms(false);
      }
    }

    loadPlatforms();
  }, []);

  useEffect(() => {
    if (modal.addStepOpen || modal.editStepOpen) {
      (async () => {
        try {
          const availableSteps = await fetchSupportsSteps();
          setSteps(availableSteps);
        } catch (err) {
          console.error("Failed to load available steps:", err);
        }
      })();
    }
  }, [modal.addStepOpen, modal.editStepOpen]);

  useEffect(() => {
    if (modal.finalizeOpen) {
      (async () => {
        try {
          const [availableFeedbacks, availableResults] = await Promise.all([
            fetchSupportsFeedbacks(),
            fetchSupportsResults(),
          ]);
          setFeedbacks(availableFeedbacks);
          setResults(availableResults);
        } catch (err) {
          console.error("Failed to load feedbacks/results:", err);
        }
      })();
    }
  }, [modal.finalizeOpen]);

  const handleStepSubmit = (data: any) => {
    console.log(
      "Add step for application:",
      modal.selectedApplication?.id,
      data
    );
    modal.setAddStepOpen(false);
  };

  const handleFinalizeSubmit = async (data: {
    final_step: string;
    feedback_id: string;
    finalize_date: string;
    salary_offer?: string;
    final_observation?: string;
  }) => {
    if (!modal.selectedApplication?.id) return;

    const payload: FinalizeApplicationPayload = {
      step_id: parseInt(data.final_step, 10),
      feedback_id: parseInt(data.feedback_id, 10),
      finalize_date: data.finalize_date,
      salary_offer: data.salary_offer
        ? parseFloat(data.salary_offer)
        : undefined,
      observation: data.final_observation,
    };

    try {
      await finalizeApplication(modal.selectedApplication.id, payload);
      await mutateSteps(modal.selectedApplication.id);
      await mutateApplications();
      modal.setFinalizeOpen(false);
    } catch (err) {
      console.error("Error finalizing application:", err);
    }
  };

  const handleEditSubmit = async (data: ApplicationFormData) => {
    if (!modal.selectedApplication?.id) return;

    const payload: UpdateApplicationPayload = {
      company: data.company,
      role: data.role,
      application_date: data.application_date,
      platform_id: parseInt(data.platform_id as string, 10),
      mode: data.mode ?? "active",
      expected_salary: data.expected_salary,
      salary_range_min: data.salary_range_min,
      salary_range_max: data.salary_range_max,
      observation: data.observation,
    };

    await updateApplication(modal.selectedApplication.id, payload);
    await mutateApplications();
    modal.setEditAppOpen(false);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteApplication(id);
      await mutateApplications();
      modal.setDeleteAppOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (error)
    return <div className="text-red-400">Failed to load applications</div>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {(displayedApps || []).map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          onAddStep={modal.openAddStep}
          onEditStep={modal.openEditStep}
          onDeleteStep={modal.openDeleteStep}
          onEditApp={modal.openEditApp}
          onDeleteApp={modal.openDeleteApp}
          onFinalizeApp={modal.openFinalizeApp}
        />
      ))}

      <AddStepModal
        isOpen={modal.addStepOpen}
        onClose={() => modal.setAddStepOpen(false)}
        steps={steps}
        applicationId={modal.selectedApplication?.id || ""}
        applicationInfo={modal.selectedApplication?.company ?? ""}
        onSuccess={() => {
          mutateApplications();
          modal.setAddStepOpen(false);
        }}
      />

      <FinalizeApplicationModal
        isOpen={modal.finalizeOpen}
        onClose={() => modal.setFinalizeOpen(false)}
        applicationId={modal.selectedApplication?.id || ""}
        feedbacks={feedbacks.map((f) => ({ id: String(f.id), name: f.name }))}
        results={results.map((r) => ({ id: String(r.id), name: r.name }))}
        onSubmit={handleFinalizeSubmit}
      />

      <EditApplicationModal
        isOpen={modal.editAppOpen}
        onClose={() => modal.setEditAppOpen(false)}
        platforms={platforms.map((p) => ({ id: String(p.id), name: p.name }))}
        initialData={
          modal.selectedApplication
            ? {
                id: modal.selectedApplication.id,
                company: modal.selectedApplication.company,
                role: modal.selectedApplication.role,
                application_date: modal.selectedApplication.application_date,
                platform_id: modal.selectedApplication.platform_id ?? undefined,
                mode:
                  modal.selectedApplication.mode === "active" ||
                  modal.selectedApplication.mode === "passive"
                    ? modal.selectedApplication.mode
                    : undefined,
                expected_salary: modal.selectedApplication.expected_salary,
                salary_range_min: modal.selectedApplication.salary_range_min,
                salary_range_max: modal.selectedApplication.salary_range_max,
                observation: modal.selectedApplication.observation,
              }
            : undefined
        }
        onSubmit={handleEditSubmit}
      />

      <DeleteApplicationModal
        isOpen={modal.deleteAppOpen}
        onClose={() => modal.setDeleteAppOpen(false)}
        onDelete={() => handleDelete(modal.selectedApplication?.id)}
        isDeleting={isDeleting}
      />

      {modal.selectedStep && (
        <>
          <EditStepModal
            isOpen={modal.editStepOpen}
            onClose={() => modal.setEditStepOpen(false)}
            applicationId={modal.selectedApplication?.id ?? ""}
            initialData={{
              id: modal.selectedStep.id ?? "",
              step_id: modal.selectedStep.step_id ?? "",
              step_name: modal.selectedStep.step_name ?? "",
              step_date: modal.selectedStep.step_date ?? "",
              observation: modal.selectedStep.observation ?? "",
            }}
            onSuccess={async () => {
              await mutateApplications();
              modal.setEditStepOpen(false);
            }}
          />

          <DeleteStepModal
            isOpen={modal.deleteStepOpen}
            onClose={() => modal.setDeleteStepOpen(false)}
            applicationId={modal.selectedApplication?.id ?? ""}
            stepId={modal.selectedStep.id ?? ""}
            stepName={modal.selectedStep.step_name ?? ""}
            stepDate={modal.selectedStep.step_date ?? ""}
            onSuccess={async () => {
              await mutateApplications();
              modal.setDeleteStepOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}
