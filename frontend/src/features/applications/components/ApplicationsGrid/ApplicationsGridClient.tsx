import React, { useState, useEffect } from "react";
import ApplicationCard from "../ApplicationCard";
import useApplicationModals from "../../hooks/useApplicationModals";
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
} from "@/features/applications/services/applicationsService";
import { fetchSupportsSteps } from "@/features/applications/services/applicationStepsService";

interface ApplicationsGridProps {
  applications: Application[];
}

export default function ApplicationsGrid({
  applications,
}: ApplicationsGridProps) {
  const modal = useApplicationModals();
  const [localApps, setLocalApps] = useState(applications);
  const [isDeleting, setIsDeleting] = useState(false);
  const [steps, setSteps] = useState<{ id: number; name: string }[]>([]);

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

  // ---- STEP HANDLERS ----
  const handleStepSubmit = (data: any) => {
    console.log(
      "Add step for application:",
      modal.selectedApplication?.id,
      data
    );
    modal.setAddStepOpen(false);
  };

  // ---- FINALIZE HANDLER ----
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
      const updatedApp = await finalizeApplication(
        modal.selectedApplication.id,
        payload
      );

      // update local list
      setLocalApps((prev) =>
        prev.map((a) =>
          a.id === modal.selectedApplication?.id ? updatedApp : a
        )
      );

      modal.setFinalizeOpen(false);
    } catch (err) {
      console.error("Error finalizing application:", err);
    }
  };
  // ---- EDIT HANDLER ----
  const handleEditSubmit = async (data: ApplicationFormData) => {
    if (!modal.selectedApplication?.id) return;

    // normalize to match UpdateApplicationPayload
    const payload: UpdateApplicationPayload = {
      company: data.company,
      role: data.role,
      application_date: data.application_date,

      platform_id: parseInt(data.platform_id as string, 10),

      // enforce strict type
      mode: data.mode ?? "active", // or fallback default, adjust if backend allows omission

      expected_salary: data.expected_salary,
      salary_range_min: data.salary_range_min,
      salary_range_max: data.salary_range_max,
      observation: data.observation,
    };

    const updatedApp = await updateApplication(
      modal.selectedApplication.id,
      payload
    );

    setLocalApps((prev) =>
      prev.map((a) => (a.id === modal.selectedApplication?.id ? updatedApp : a))
    );

    modal.setEditAppOpen(false);
  };

  // ---- DELETE HANDLER ----
  const handleDelete = async (id?: string) => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteApplication(id);
      setLocalApps((prev) => prev.filter((a) => a.id !== id));
      modal.setDeleteAppOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {localApps.map((app) => (
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
      <AddStepModal
        isOpen={modal.addStepOpen}
        onClose={() => modal.setAddStepOpen(false)}
        steps={steps}
        applicationId={modal.selectedApplication?.id || ""}
        applicationInfo={modal.selectedApplication?.company ?? ""}
        onSuccess={(data) => {
          console.log("Add step success:", data);
          modal.setAddStepOpen(false);
        }}
      />

      <FinalizeApplicationModal
        isOpen={modal.finalizeOpen}
        onClose={() => modal.setFinalizeOpen(false)}
        feedbacks={[
          { id: "1", name: "Positive" },
          { id: "2", name: "Neutral" },
          { id: "3", name: "Negative" },
        ]}
        onSubmit={handleFinalizeSubmit}
      />

      <EditApplicationModal
        isOpen={modal.editAppOpen}
        onClose={() => modal.setEditAppOpen(false)}
        platforms={[
          { id: "1", name: "LinkedIn" },
          { id: "2", name: "Indeed" },
          { id: "3", name: "Glassdoor" },
        ]}
        initialData={
          modal.selectedApplication
            ? {
                company: modal.selectedApplication.company,
                role: modal.selectedApplication.role,
                application_date: modal.selectedApplication.application_date,

                // platform_id can be string (for <select>) or number
                platform_id: modal.selectedApplication.platform_id ?? undefined,

                // only allow "active" or "passive"
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
            applicationId={modal.selectedApplication?.id || ""}
            initialData={{
              id: modal.selectedStep.id,
              step_id: modal.selectedStep.step_id,
              step_name: modal.selectedStep.step_name,
              step_date: modal.selectedStep.step_date,
              observation: modal.selectedStep.observation,
            }}
            onSuccess={(updatedStep) => {
              console.log("Step updated successfully:", updatedStep);
              modal.setEditStepOpen(false);
            }}
          />

          <DeleteStepModal
            isOpen={modal.deleteStepOpen}
            onClose={() => modal.setDeleteStepOpen(false)}
            applicationId={modal.selectedApplication?.id ?? ""}
            stepId={modal.selectedStep?.id ?? ""}
            stepName={modal.selectedStep?.step_name ?? ""}
            stepDate={modal.selectedStep?.step_date ?? ""}
            onSuccess={(deletedStepId) => {
              setLocalApps((prev) =>
                prev.map((app) =>
                  app.id === modal.selectedApplication?.id
                    ? {
                        ...app,
                        steps: app.steps?.filter((s) => s.id !== deletedStepId),
                      }
                    : app
                )
              );
              modal.setDeleteStepOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}
