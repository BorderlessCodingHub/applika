import { useState } from "react";
import type { BaseApplicationFormData } from "../schemas/applications/applicationBaseSchema";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";

/**
 * Hook to manage all modals for Applications and Application Steps
 */
export default function useApplicationModals() {
  // Selected application and step
  const [selectedApplication, setSelectedApplication] = useState<BaseApplicationFormData | null>(null);
  const [selectedStep, setSelectedStep] = useState<ApplicationStep | null>(null);

  // Step modals
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editStepOpen, setEditStepOpen] = useState(false);
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);

  // Application modals
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [editAppOpen, setEditAppOpen] = useState(false);
  const [deleteAppOpen, setDeleteAppOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  // ---------------- Step Modals ----------------
  const openAddStep = (app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setAddStepOpen(true);
  };

  const openEditStep = (step: ApplicationStep, app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setEditStepOpen(true);
  };

  const openDeleteStep = (step: ApplicationStep, app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setDeleteStepOpen(true);
  };

  // ---------------- Application Modals ----------------
  const openAddApp = (app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setAddAppOpen(true);
  };

  const openEditApp = (app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setEditAppOpen(true);
  };

  const openDeleteApp = (app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setDeleteAppOpen(true);
  };

  const openFinalizeApp = (app: BaseApplicationFormData) => {
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
    openAddApp,
    openEditApp,
    openDeleteApp,
    openFinalizeApp,

    // Manual set functions (optional)
    setAddStepOpen,
    setEditStepOpen,
    setDeleteStepOpen,
    setAddAppOpen,
    setEditAppOpen,
    setDeleteAppOpen,
    setFinalizeOpen,
  };
}
