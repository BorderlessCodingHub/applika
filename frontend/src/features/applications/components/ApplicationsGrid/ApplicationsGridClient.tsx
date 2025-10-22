"use client";

import React, { useEffect, useState } from "react";
import ApplicationCard from "../ApplicationCard";
import useApplicationModals from "../../hooks/useApplicationModals";
import {
  useApplications,
  mutateApplications,
} from "../../hooks/useApplications";
import { mutateSteps } from "../../hooks/useApplicationSteps";

import SearchApplications from "../SearchApplications";
import AddApplicationModal from "../../modals/AddApplicationModal";
import AddStepModal from "../../steps/AddStepModal";
import FinalizeApplicationModal from "../../modals/FinalizeApplicationModal";
import EditApplicationModal from "../../modals/EditApplicationModal";
import DeleteApplicationModal from "../../modals/DeleteApplicationModal";
import EditStepModal from "../../steps/EditStepModal";
import DeleteStepModal from "../../steps/DeleteStepModal";
import type { Application } from "@/features/applications/types";
import type { BaseApplicationFormData } from "@/features/applications/schemas/applications/applicationBaseSchema";
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
  searchTerm?: string;
  addAppOpen?: boolean;
  setAddAppOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ApplicationsGrid({
  applications = [],
  searchTerm = "",
  addAppOpen = false,
  setAddAppOpen,
}: ApplicationsGridProps) {
  const { applications: appsFromHook, error } = useApplications();
  const [localApplications, setLocalApplications] =
    useState<Application[]>(applications);
  // const [searchTerm, setSearchTerm] = useState("");

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

  // Filter applications based on search
  const displayedApps = localApplications.filter(
    (app) =>
      app.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => setLocalApplications(applications), [applications]);

  useEffect(() => {
    setLocalApplications(applications);
  }, [applications]);

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

  const handleEditSubmit = async (data: BaseApplicationFormData) => {
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
      {displayedApps.map((app) => (
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

      {/* Modals */}
      <AddApplicationModal
        isOpen={addAppOpen}
        onClose={() => setAddAppOpen?.(false)}
        platforms={platforms.map((p) => ({ id: String(p.id), name: p.name }))}
        onSubmit={() => setAddAppOpen?.(false)}
      />

      <AddStepModal
        isOpen={modal.addStepOpen}
        onClose={() => modal.setAddStepOpen(false)}
        steps={steps}
        loadingSteps={modal.addStepOpen && steps.length === 0}
        applicationId={modal.selectedApplication?.id || ""}
        applicationInfo={modal.selectedApplication?.company ?? ""}
        onSuccess={async () => {
          await mutateApplications();
          modal.setAddStepOpen(false);
        }}
      />

      <FinalizeApplicationModal
        isOpen={modal.finalizeOpen}
        onClose={() => modal.setFinalizeOpen(false)}
        applicationId={modal.selectedApplication?.id || ""}
        feedbacks={feedbacks.map((f) => ({ id: String(f.id), name: f.name }))}
        results={results.map((r) => ({ id: String(r.id), name: r.name }))}
        loadingFeedbacks={modal.finalizeOpen && feedbacks.length === 0}
        loadingResults={modal.finalizeOpen && results.length === 0}
        onSubmit={handleFinalizeSubmit}
      />

      <EditApplicationModal
        isOpen={modal.editAppOpen}
        onClose={() => modal.setEditAppOpen(false)}
        platforms={platforms.map((p) => ({ id: String(p.id), name: p.name }))}
        loadingPlatforms={loadingPlatforms}
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
        onSubmit={() => handleDelete(modal.selectedApplication?.id)}
        loading={isDeleting}
        applicationName={modal.selectedApplication?.company}
      />

      {modal.selectedStep && (
        <>
          <EditStepModal
            isOpen={modal.editStepOpen}
            onClose={() => modal.setEditStepOpen(false)}
            steps={steps}
            loadingSteps={modal.editStepOpen && steps.length === 0}
            applicationId={modal.selectedApplication?.id ?? ""}
            initialData={{
              id: Number(modal.selectedStep.id),
              step_id: Number(modal.selectedStep.step_id),
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
