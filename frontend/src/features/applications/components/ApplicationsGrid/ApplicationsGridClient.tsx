"use client";

import { useMemo } from "react";
import ApplicationCard from "../ApplicationCard";

import { useModal } from "../../context/ModalProvider";
import {
  useApplications,
  mutateApplications,
} from "../../hooks/useApplications";
import { useSupports } from "../../hooks/useSupports";
import { mutateSteps } from "../../hooks/useApplicationSteps";

import {
  createApplication,
  updateApplication,
  finalizeApplication,
  deleteApplication,
} from "../../services/applicationsService";

import {
  addApplicationStep,
  updateApplicationStep,
  deleteApplicationStep,
} from "../../services/applicationStepsService";

import {
  AddApplicationModal,
  EditApplicationModal,
  FinalizeApplicationModal,
  DeleteApplicationModal,
} from "../../modals";

import { AddStepModal, EditStepModal, DeleteStepModal } from "../../steps";

import type { Application } from "../../types";
import type {
  CreateApplicationPayload,
  UpdateApplicationPayload,
  FinalizeApplicationPayload,
} from "../../services/applicationsService";

import type { AddStepPayload, UpdateStepPayload } from "../../services/applicationStepsService";

interface ApplicationsGridProps {
  applications?: Application[];
  searchTerm?: string;
}

export default function ApplicationsGridClient({
  applications = [],
  searchTerm = "",
}: ApplicationsGridProps) {
  const modal = useModal();
  const { applications: fetchedApps, error } = useApplications();
  const { supports, isLoading: loadingSupports } = useSupports();

  const localApplications = applications.length ? applications : fetchedApps;

  const displayedApps = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return localApplications.filter(
      (app) =>
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query)
    );
  }, [localApplications, searchTerm]);

  // ======================
  // Modal submit handlers
  // ======================

  async function handleCreate(data: CreateApplicationPayload) {
    await createApplication({
      ...data,
      platform_id: Number(data.platform_id),
    });
    await mutateApplications();
    modal.close("addApp");
  }

  async function handleEdit(data: UpdateApplicationPayload) {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    await updateApplication(id, {
      ...data,
      platform_id: Number(data.platform_id),
    });
    await mutateApplications();
    modal.close("editApp");
  }

  async function handleFinalize(data: FinalizeApplicationPayload) {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    await finalizeApplication(id, data);
    await mutateSteps(id);
    await mutateApplications();
    modal.close("finalizeApp");
  }

  async function handleDelete() {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    await deleteApplication(id);
    await mutateApplications();
    modal.close("deleteApp");
  }

  // Add Step
  async function handleAddStep(data: AddStepPayload) {
    const appId = modal.state.selectedApplication?.id;
    if (!appId) return;

    // Send API request
    await addApplicationStep(appId, data);

    // Refresh steps and applications
    await mutateSteps(appId);
    await mutateApplications();

    modal.close("addStep");
  }

  // Edit Step
  async function handleEditStep({
    applicationId,
    data,
  }: {
    applicationId: string | number;
    data: UpdateStepPayload & { id: number };
  }) {
    await updateApplicationStep(applicationId, data.id, data);
    await mutateSteps(applicationId);
    await mutateApplications();
    modal.close("editStep");
  }

  // Delete Step
  async function handleDeleteStep({
    applicationId,
    stepId,
  }: {
    applicationId: string | number;
    stepId: string | number;
  }) {
    await deleteApplicationStep(applicationId, stepId);
    await mutateSteps(applicationId);
    await mutateApplications();
    modal.close("deleteStep");
  }

  if (error)
    return <div className="text-red-500">Failed to load applications.</div>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {displayedApps.map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          onAddStep={() => modal.open("addStep", { application: app })}
          onEditStep={(step) =>
            modal.open("editStep", { step, application: app })
          }
          onDeleteStep={(step) =>
            modal.open("deleteStep", { step, application: app })
          }
          onEditApp={() => modal.open("editApp", { application: app })}
          onDeleteApp={() => modal.open("deleteApp", { application: app })}
          onFinalizeApp={() => modal.open("finalizeApp", { application: app })}
        />
      ))}

      {/* Application Modals */}
      <AddApplicationModal
        isOpen={modal.isOpen("addApp")}
        onClose={() => modal.close("addApp")}
        onSubmit={handleCreate}
        platforms={supports.platforms}
        loading={loadingSupports}
      />

      {modal.state.selectedApplication && (
        <EditApplicationModal
          isOpen={modal.isOpen("editApp")}
          onClose={() => modal.close("editApp")}
          onSubmit={handleEdit}
          platforms={supports.platforms}
          loadingPlatforms={loadingSupports}
          initialData={modal.state.selectedApplication}
        />
      )}

      <FinalizeApplicationModal
        isOpen={modal.isOpen("finalizeApp")}
        onClose={() => modal.close("finalizeApp")}
        onSubmit={handleFinalize}
        feedbacks={supports.feedbacks}
        results={supports.results}
        loading={loadingSupports}
        applicationId={String(modal.state.selectedApplication?.id ?? "")}
      />

      <DeleteApplicationModal
        isOpen={modal.isOpen("deleteApp")}
        onClose={() => modal.close("deleteApp")}
        onSubmit={handleDelete}
        applicationName={modal.state.selectedApplication?.company}
      />

      {/* Step Modals */}
      <AddStepModal
        isOpen={modal.isOpen("addStep")}
        onClose={() => modal.close("addStep")}
        steps={supports.steps}
        applicationId={String(modal.state.selectedApplication?.id ?? "")}
        applicationInfo={modal.state.selectedApplication?.company ?? ""}
        loadingSteps={loadingSupports}
        onSuccess={handleAddStep}
      />

      {modal.state.selectedStep && (
        <>
          <EditStepModal
            isOpen={modal.isOpen("editStep")}
            onClose={() => modal.close("editStep")}
            steps={supports.steps}
            applicationId={String(modal.state.selectedApplication?.id ?? "")}
            initialData={{
              id: Number(modal.state.selectedStep.id),
              step_id: Number(modal.state.selectedStep.step_id),
              step_name: modal.state.selectedStep.step_name ?? "",
              step_date: modal.state.selectedStep.step_date ?? "",
              observation: modal.state.selectedStep.observation ?? "",
            }}
            loadingSteps={loadingSupports}
            onSubmit={({ applicationId, data }) =>
              handleEditStep({ applicationId, data })
            }
          />

          <DeleteStepModal
            isOpen={modal.isOpen("deleteStep")}
            onClose={() => modal.close("deleteStep")}
            applicationId={String(modal.state.selectedApplication?.id ?? "")}
            stepId={String(modal.state.selectedStep.id ?? "")}
            stepName={modal.state.selectedStep.step_name ?? ""}
            stepDate={modal.state.selectedStep.step_date ?? ""}
            onSubmit={() =>
              handleDeleteStep({
                applicationId: String(
                  modal.state.selectedApplication?.id ?? ""
                ),
                stepId: String(modal.state.selectedStep.id ?? ""),
              })
            }
          />
        </>
      )}
    </div>
  );
}
