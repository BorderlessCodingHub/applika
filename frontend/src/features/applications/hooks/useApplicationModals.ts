// hooks/useApplicationModals.ts
import { useState } from 'react';
import { Step } from '../steps/types';
import { Application } from '../steps/types';

export default function useApplicationModals() {
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);
  
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editStepOpen, setEditStepOpen] = useState(false);
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);
  const [editAppOpen, setEditAppOpen] = useState(false);
  const [deleteAppOpen, setDeleteAppOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const openAddStep = (app: Application) => { setSelectedApplication(app); setAddStepOpen(true); };
  const openEditStep = (step: Step, app: Application) => { setSelectedApplication(app); setSelectedStep(step); setEditStepOpen(true); };
  const openDeleteStep = (step: Step, app: Application) => { setSelectedApplication(app); setSelectedStep(step); setDeleteStepOpen(true); };
  const openEditApp = (app: Application) => { setSelectedApplication(app); setEditAppOpen(true); };
  const openDeleteApp = (app: Application) => { setSelectedApplication(app); setDeleteAppOpen(true); };
  const openFinalizeApp = (app: Application) => { setSelectedApplication(app); setFinalizeOpen(true); };

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
