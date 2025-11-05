"use client";

import { useMemo, useState } from "react";
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

import type {
  AddStepPayload,
  UpdateStepPayload,
} from "../../schemas/applicationsStepsSchema";

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

  const localApplications = (
    applications.length ? applications : fetchedApps
  ).map((app) => ({
    ...app,
    finalized: app.feedback !== null,
  }));

  const displayedApps = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return localApplications.filter(
      (app) =>
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query)
    );
  }, [localApplications, searchTerm]);

  // ---------------- Loading states for modal submits ----------------
  const [loadingAddApp, setLoadingAddApp] = useState(false);
  const [loadingEditApp, setLoadingEditApp] = useState(false);
  const [loadingFinalizeApp, setLoadingFinalizeApp] = useState(false);
  const [loadingDeleteApp, setLoadingDeleteApp] = useState(false);

  const [loadingAddStep, setLoadingAddStep] = useState(false);
  const [loadingEditStep, setLoadingEditStep] = useState(false);
  const [loadingDeleteStep, setLoadingDeleteStep] = useState(false);

  // ======================
  // Modal submit handlers
  // ======================

  async function handleCreate(data: CreateApplicationPayload) {
    setLoadingAddApp(true);
    try {
      console.log("Payload being sent:", data);
      await createApplication({
        ...data,
        platform_id: Number(data.platform_id),
      });
      await mutateApplications();
      modal.close("addApp");
    } finally {
      setLoadingAddApp(false);
    }
  }

  async function handleEdit(data: Partial<UpdateApplicationPayload>) {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    setLoadingEditApp(true);
    try {
      await updateApplication(id, {
        ...data,
        platform_id: data.platform_id ? Number(data.platform_id) : undefined,
      });
      await mutateApplications();
      modal.close("editApp");
    } finally {
      setLoadingEditApp(false);
    }
  }

  async function handleFinalize(data: FinalizeApplicationPayload) {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    setLoadingFinalizeApp(true);
    try {
      await finalizeApplication(id, data);
      await mutateSteps(id);
      await mutateApplications();
      modal.close("finalizeApp");
    } finally {
      setLoadingFinalizeApp(false);
    }
  }

  async function handleDelete() {
    const id = modal.state.selectedApplication?.id;
    if (!id) return;
    setLoadingDeleteApp(true);
    try {
      await deleteApplication(id);
      await mutateApplications();
      modal.close("deleteApp");
    } finally {
      setLoadingDeleteApp(false);
    }
  }

  // Add Step
  async function handleAddStep(data: AddStepPayload) {
    const appId = modal.state.selectedApplication?.id;
    if (!appId) return;
    setLoadingAddStep(true);
    try {
      await addApplicationStep(appId, data);
      await mutateSteps(appId);
      await mutateApplications();
      modal.close("addStep");
    } finally {
      setLoadingAddStep(false);
    }
  }
  // Edit Step
  async function handleEditStep({
    applicationId,
    stepId,
    data,
  }: {
    applicationId: string | number;
    stepId: number;
    data: UpdateStepPayload;
  }) {
    setLoadingEditStep(true);
    try {
      await updateApplicationStep(applicationId, stepId, data);
      await mutateSteps(applicationId);
      await mutateApplications();
      modal.close("editStep");
    } finally {
      setLoadingEditStep(false);
    }
  }

  // Delete Step
  async function handleDeleteStep({
    applicationId,
    stepId,
  }: {
    applicationId: string | number;
    stepId: string | number;
  }) {
    setLoadingDeleteStep(true);
    try {
      await deleteApplicationStep(applicationId, stepId);
      await mutateSteps(applicationId);
      await mutateApplications();
      modal.close("deleteStep");
    } finally {
      setLoadingDeleteStep(false);
    }
  }

  if (error)
    return <div className="text-red-500">Failed to load applications.</div>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {displayedApps.map((app) => (
        <ApplicationCard
          key={app.id}
          app={{
            ...app,
            platform:
              supports.platforms.find((p) => p.id === app.platform_id) ??
              (app.platform_id
                ? {
                    id: app.platform_id,
                    name: app.platform_name ?? "Unknown Platform",
                  }
                : { id: 0, name: "Unknown Platform" }),
          }}
          onAddStep={() =>
            !app.finalized && modal.open("addStep", { application: app })
          }
          onEditStep={(step) =>
            !app.finalized && modal.open("editStep", { step, application: app })
          }
          onDeleteStep={(step) =>
            !app.finalized &&
            modal.open("deleteStep", { step, application: app })
          }
          onEditApp={() =>
            !app.finalized && modal.open("editApp", { application: app })
          }
          onDeleteApp={() => modal.open("deleteApp", { application: app })}
          onFinalizeApp={() =>
            !app.finalized && modal.open("finalizeApp", { application: app })
          }
        />
      ))}

      {/* Application Modals */}
      <AddApplicationModal
        isOpen={modal.isOpen("addApp")}
        onClose={() => modal.close("addApp")}
        onSubmit={handleCreate}
        platforms={supports.platforms}
        loadingPlatforms={loadingSupports}
        loading={loadingAddApp}
      />

      {modal.state.selectedApplication && (
        <EditApplicationModal
          isOpen={modal.isOpen("editApp")}
          onClose={() => modal.close("editApp")}
          onSubmit={handleEdit}
          platforms={supports.platforms}
          loadingPlatforms={loadingSupports}
          loading={loadingEditApp}
          initialData={modal.state.selectedApplication}
        />
      )}

      <FinalizeApplicationModal
        isOpen={modal.isOpen("finalizeApp")}
        onClose={() => modal.close("finalizeApp")}
        onSubmit={handleFinalize}
        feedbacks={supports.feedbacks}
        results={supports.results}
        loadingFeedbacks={loadingSupports}
        loadingResults={loadingSupports}
        loading={loadingFinalizeApp}
        applicationId={String(modal.state.selectedApplication?.id ?? "")}
      />

      <DeleteApplicationModal
        isOpen={modal.isOpen("deleteApp")}
        onClose={() => modal.close("deleteApp")}
        onSubmit={handleDelete}
        applicationName={modal.state.selectedApplication?.company}
        loading={loadingDeleteApp}
      />

      {/* Step Modals */}
      <AddStepModal
        isOpen={modal.isOpen("addStep")}
        onClose={() => modal.close("addStep")}
        steps={supports.steps}
        applicationId={String(modal.state.selectedApplication?.id ?? "")}
        applicationInfo={modal.state.selectedApplication?.company ?? ""}
        loadingSteps={loadingSupports}
        loading={loadingAddStep}
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
              id: modal.state.selectedStep.id,
              step_id: Number(modal.state.selectedStep.step_id),
              step_name: modal.state.selectedStep.step_name ?? "",
              step_date: modal.state.selectedStep.step_date ?? "",
              observation: modal.state.selectedStep.observation ?? "",
            }}
            loadingSteps={loadingSupports}
            loading={loadingEditStep}
            onSubmit={({ applicationId, stepId, data }) =>
              handleEditStep({
                applicationId,
                stepId: stepId,
                data,
              })
            }
          />

          <DeleteStepModal
            isOpen={modal.isOpen("deleteStep")}
            onClose={() => modal.close("deleteStep")}
            applicationId={String(modal.state.selectedApplication?.id ?? "")}
            stepId={String(modal.state.selectedStep.id ?? "")}
            stepName={modal.state.selectedStep.step_name ?? ""}
            stepDate={modal.state.selectedStep.step_date ?? ""}
            loading={loadingDeleteStep}
            onSubmit={() =>
              handleDeleteStep({
                applicationId: String(
                  modal.state.selectedApplication?.id ?? ""
                ),
                stepId: String(modal.state.selectedStep?.id ?? ""),
              })
            }
          />
        </>
      )}
    </div>
  );
}
