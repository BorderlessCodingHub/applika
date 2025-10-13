import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Step, Application } from "../types";
import { fetchApplications } from "../services/applicationsService";
import { fetchApplicationSteps } from "../services/applicationStepsService";

/* ----------------------------- SWR Fetchers ----------------------------- */

const fetcherApplications = async (): Promise<Application[]> => {
  return await fetchApplications();
};

const fetcherSteps = async (appId: string): Promise<Step[]> => {
  const data = await fetchApplicationSteps(appId);
  return data.map((s) => ({
    id: s.id.toString(),
    step_id: s.step_id.toString(),
    step_name: s.step_name,
    step_date: s.step_date,
    observation: s.observation,
    step_color: s.step_color || "#4ade80",
  }));
};

/* ----------------------------- Applications Hook ----------------------------- */

export function useApplications() {
  const { data, error, isLoading, isValidating } = useSWR<Application[]>(
    "/api/applications",
    fetcherApplications
  );

  return {
    applications: data || [],
    isLoading,
    isValidating,
    error,
  };
}

/* ----------------------------- Application Steps Hook ----------------------------- */

export function useApplicationSteps(applicationId?: string) {
  const shouldFetch = Boolean(applicationId);

  const { data, error, isLoading, isValidating } = useSWR<Step[]>(
    shouldFetch ? `/api/applications/${applicationId}/steps` : null,
    applicationId ? () => fetcherSteps(applicationId) : null
  );

  return {
    steps: data || [],
    isLoading,
    isValidating,
    error,
  };
}

/* ----------------------------- Mutations ----------------------------- */

export async function mutateApplications() {
  try {
    await mutate("/api/applications");
    if (typeof window !== "undefined") {
      console.log(
        "[useApplicationModals] mutateApplications -> dispatch applications:updated"
      );
      window.dispatchEvent(new Event("applications:updated"));
    }
  } catch (err) {
    console.error("[useApplicationModals] mutateApplications error:", err);
    throw err;
  }
}

export async function mutateSteps(applicationId: string) {
  await mutate(`/api/applications/${applicationId}/steps`);
}

/* ----------------------------- Modal State Hook ----------------------------- */

export default function useApplicationModals() {
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editStepOpen, setEditStepOpen] = useState(false);
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);
  const [editAppOpen, setEditAppOpen] = useState(false);
  const [deleteAppOpen, setDeleteAppOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const openAddStep = (app: Application) => {
    setSelectedApplication(app);
    setAddStepOpen(true);
  };

  const openEditStep = (step: Step, app: Application) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setEditStepOpen(true);
  };

  const openDeleteStep = (step: Step, app: Application) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setDeleteStepOpen(true);
  };

  const openEditApp = (app: Application) => {
    setSelectedApplication(app);
    setEditAppOpen(true);
  };

  const openDeleteApp = (app: Application) => {
    setSelectedApplication(app);
    setDeleteAppOpen(true);
  };

  const openFinalizeApp = (app: Application) => {
    setSelectedApplication(app);
    setFinalizeOpen(true);
  };

  return {
    selectedApplication,
    selectedStep,
    addStepOpen,
    editStepOpen,
    deleteStepOpen,
    editAppOpen,
    deleteAppOpen,
    finalizeOpen,
    openAddStep,
    openEditStep,
    openDeleteStep,
    openEditApp,
    openDeleteApp,
    openFinalizeApp,
    setAddStepOpen,
    setEditStepOpen,
    setDeleteStepOpen,
    setEditAppOpen,
    setDeleteAppOpen,
    setFinalizeOpen,
  };
}
