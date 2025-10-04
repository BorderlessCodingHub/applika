import React from "react";
import ApplicationCard from "../ApplicationCard";
import useApplicationModals from "../../hooks/useApplicationModals";
import AddStepModal from "../../steps/AddStepModal";
import FinalizeApplicationModal from "../../modals/FinalizeApplicationModal";
import EditApplicationModal from "../../modals/EditApplicationModal";
import DeleteApplicationModal from "../../modals/DeleteApplicationModal";
import EditStepModal from "../../steps/EditStepModal";
import DeleteStepModal from "../../steps/DeleteStepModal";
import type { Application } from "@/features/applications/steps/types";
import {
  finalizeApplication,
  FinalizeApplicationPayload,
} from "@/features/applications/services/applicationsService";

interface ApplicationsGridProps {
  applications: Application[];
}

export default function ApplicationsGrid({
  applications,
}: ApplicationsGridProps) {
  const modal = useApplicationModals();

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
      const updatedApp = await finalizeApplication(
        modal.selectedApplication.id,
        payload
      );
      console.log("Application finalized:", updatedApp);
      modal.setFinalizeOpen(false);

      // Optionally, update the applications list locally to reflect finalization
    } catch (err) {
      console.error("Error finalizing application:", err);
    }
  };

  const handleEditSubmit = (data: any) => {
    console.log("Edit application:", modal.selectedApplication?.id, data);
    modal.setEditAppOpen(false);
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    console.log("Delete application:", id);
    modal.setDeleteAppOpen(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {applications.map((app) => (
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
        steps={[]} // ideally you fetch actual steps
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
          { id: "p1", name: "LinkedIn" },
          { id: "p2", name: "Indeed" },
          { id: "p3", name: "Glassdoor" },
        ]}
        initialData={
          modal.selectedApplication
            ? {
                company: modal.selectedApplication.company,
                role: modal.selectedApplication.role,
                application_date: modal.selectedApplication.application_date,
                platform_id: modal.selectedApplication.platform_name,
                mode: "active",
                expected_salary: modal.selectedApplication.salary_range_min,
                salary_range_min: modal.selectedApplication.salary_range_min,
                salary_range_max: modal.selectedApplication.salary_range_max,
                observation: "Placeholder observation",
              }
            : undefined
        }
        onSubmit={handleEditSubmit}
      />
      <DeleteApplicationModal
        isOpen={modal.deleteAppOpen}
        onClose={() => modal.setDeleteAppOpen(false)}
        onDelete={() => handleDelete(modal.selectedApplication?.id)}
      />

      {modal.selectedStep && (
        <>
          <EditStepModal
            isOpen={modal.editStepOpen}
            onClose={() => modal.setEditStepOpen(false)}
            steps={[]}
            initialData={modal.selectedStep}
            onSubmit={() => {}}
          />
          <DeleteStepModal
            isOpen={modal.deleteStepOpen}
            stepName={modal.selectedStep.step_name}
            stepDate={modal.selectedStep.step_date}
            onClose={() => modal.setDeleteStepOpen(false)}
            onConfirm={() => {}}
          />
        </>
      )}
    </div>
  );
}
