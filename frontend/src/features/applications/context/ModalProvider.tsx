"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { BaseApplicationFormData } from "../schemas/applications/applicationBaseSchema";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";
import type { Application } from "../types";

type ModalKey =
  | "addApp"
  | "editApp"
  | "deleteApp"
  | "finalizeApp"
  | "addStep"
  | "editStep"
  | "deleteStep";

interface ModalState {
  selectedApplication: (BaseApplicationFormData & { id?: number }) | null;
  selectedStep: ApplicationStep | null;
  activeModals: Record<ModalKey, boolean>;
}

interface ModalContextValue {
  state: ModalState;
  open: (
    key: ModalKey,
    payload?: {
      application?: Application | (BaseApplicationFormData & { id?: number });
      step?: ApplicationStep;
    }
  ) => void;
  close: (key: ModalKey) => void;
  isOpen: (key: ModalKey) => boolean;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>({
    selectedApplication: null,
    selectedStep: null,
    activeModals: {
      addApp: false,
      editApp: false,
      deleteApp: false,
      finalizeApp: false,
      addStep: false,
      editStep: false,
      deleteStep: false,
    },
  });

  const open = useCallback(
    (
      key: ModalKey,
      payload?: {
        application?: BaseApplicationFormData;
        step?: ApplicationStep;
      }
    ) => {
      setState((prev) => ({
        selectedApplication: payload?.application ?? prev.selectedApplication,
        selectedStep: payload?.step ?? prev.selectedStep,
        activeModals: { ...prev.activeModals, [key]: true },
      }));
    },
    []
  );

  const close = useCallback((key: ModalKey) => {
    setState((prev) => ({
      ...prev,
      activeModals: { ...prev.activeModals, [key]: false },
    }));
  }, []);

  const isOpen = useCallback(
    (key: ModalKey) => !!state.activeModals[key],
    [state.activeModals]
  );

  const value: ModalContextValue = { state, open, close, isOpen };

  return (
    <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used inside ModalProvider");
  return ctx;
}
