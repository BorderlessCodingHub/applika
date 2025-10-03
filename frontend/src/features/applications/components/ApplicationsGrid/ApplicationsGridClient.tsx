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

interface ApplicationsGridProps {
  applications: Application[];
}

export default function ApplicationsGrid({ applications }: ApplicationsGridProps) {
  const modal = useApplicationModals();

  const handleStepSubmit = (data: any) => {
    console.log("Add step for application:", modal.selectedApplication?.id, data);
    modal.setAddStepOpen(false);
  };

  const handleFinalizeSubmit = (data: any) => {
    console.log("Finalize application:", modal.selectedApplication?.id, data);
    modal.setFinalizeOpen(false);
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
        steps={[]}
        applicationInfo={modal.selectedApplication?.company ?? ""}
        onSubmit={handleStepSubmit}
      />
      <FinalizeApplicationModal
        isOpen={modal.finalizeOpen}
        onClose={() => modal.setFinalizeOpen(false)}
        feedbacks={[
          { id: "f1", name: "Positive" },
          { id: "f2", name: "Neutral" },
          { id: "f3", name: "Negative" },
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
