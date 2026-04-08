"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface CycleContextValue {
  selectedCycleId: string | null;
  setSelectedCycleId: (id: string | null) => void;
  isViewingPastCycle: boolean;
}

const CycleContext = createContext<CycleContextValue | null>(null);

export function CycleProvider({ children }: { children: ReactNode }) {
  const [selectedCycleId, setSelectedCycleIdState] = useState<string | null>(
    null,
  );

  const setSelectedCycleId = useCallback((id: string | null) => {
    setSelectedCycleIdState(id);
  }, []);

  return (
    <CycleContext.Provider
      value={{
        selectedCycleId,
        setSelectedCycleId,
        isViewingPastCycle: selectedCycleId !== null,
      }}
    >
      {children}
    </CycleContext.Provider>
  );
}

export function useCycleContext() {
  const ctx = useContext(CycleContext);
  if (!ctx) {
    throw new Error("useCycleContext must be used within CycleProvider");
  }
  return ctx;
}
