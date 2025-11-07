// src/features/applications/hooks/useApplicationModals.ts
import { useState, useCallback } from "react";
import type { BaseApplicationFormData } from "../schemas/applications/applicationBaseSchema";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";

/**
 * Hook to manage all modals for Applications and Application Steps
 * Single place for modal states and openers.
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
  const openAddStep = useCallback((app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setAddStepOpen(true);
  }, []);

  const openEditStep = useCallback((step: ApplicationStep, app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setEditStepOpen(true);
  }, []);

  const openDeleteStep = useCallback((step: ApplicationStep, app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setSelectedStep(step);
    setDeleteStepOpen(true);
  }, []);

  // ---------------- Application Modals ----------------
  const openAddApp = useCallback((app?: BaseApplicationFormData | null) => {
    if (app) setSelectedApplication(app);
    setAddAppOpen(true);
  }, []);

  const openEditApp = useCallback((app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setEditAppOpen(true);
  }, []);

  const openDeleteApp = useCallback((app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setDeleteAppOpen(true);
  }, []);

  const openFinalizeApp = useCallback((app: BaseApplicationFormData) => {
    setSelectedApplication(app);
    setFinalizeOpen(true);
  }, []);

  return {
    // Selected items
    selectedApplication,
    selectedStep,

    // Modal open states
    addStepOpen,
    editStepOpen,
    deleteStepOpen,
    addAppOpen,
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

    // Manual set functions (useful for parent-controlled flows)
    setAddStepOpen,
    setEditStepOpen,
    setDeleteStepOpen,
    setAddAppOpen,
    setEditAppOpen,
    setDeleteAppOpen,
    setFinalizeOpen,

    // setters for selected items (optional)
    setSelectedApplication,
    setSelectedStep,
  } as const;
}
