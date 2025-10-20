import { useState } from "react";
import type { ApplicationFormData } from "../schemas/applicationSchema";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";

/**
 * Hook to manage all modals for Applications and Application Steps
 */
export default function useApplicationModals() {
  // Selected application and step
  const [selectedApplication, setSelectedApplication] = useState<ApplicationFormData | null>(null);
  const [selectedStep, setSelectedStep] = useState<ApplicationStep | null>(null);

  // Step modals
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editStepOpen, setEditStepOpen] = useState(false);
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);

  // Application modals
  const [editAppOpen, setEditAppOpen] = useState(false);
  const [deleteAppOpen, setDeleteAppOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  // ---------------- Step Modals ----------------
  const openAddStep = (app: ApplicationFormData) => {
    setSelectedApplication(app);
    setAddStepOpen(true);
  };

  const openEditStep = (step: ApplicationStep, app: ApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setEditStepOpen(true);
  };

  const openDeleteStep = (step: ApplicationStep, app: ApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setDeleteStepOpen(true);
  };

  // ---------------- Application Modals ----------------
  const openEditApp = (app: ApplicationFormData) => {
    setSelectedApplication(app);
    setEditAppOpen(true);
  };

  const openDeleteApp = (app: ApplicationFormData) => {
    setSelectedApplication(app);
    setDeleteAppOpen(true);
  };

  const openFinalizeApp = (app: ApplicationFormData) => {
    setSelectedApplication(app);
    setFinalizeOpen(true);
  };

  return {
    // Selected items
    selectedApplication,
    selectedStep,

    // Modal open states
    addStepOpen,
    editStepOpen,
    deleteStepOpen,
    editAppOpen,
    deleteAppOpen,
    finalizeOpen,

    // Modal open functions
    openAddStep,
    openEditStep,
    openDeleteStep,
    openEditApp,
    openDeleteApp,
    openFinalizeApp,

    // Manual set functions (optional)
    setAddStepOpen,
    setEditStepOpen,
    setDeleteStepOpen,
    setEditAppOpen,
    setDeleteAppOpen,
    setFinalizeOpen,
  };
}
