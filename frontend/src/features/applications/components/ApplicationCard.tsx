import React, { useState, useEffect } from "react";
import CardDetails from "../CardDetails";
import { Application, Step } from "../types";
import { fetchApplicationSteps, ApplicationStep } from "@/features/applications/services/applicationStepsService";

interface ApplicationCardProps {
  app: Application;
  onAddStep: (app: Application) => void;
  onEditStep: (step: Step, app: Application) => void;
  onDeleteStep: (step: Step, app: Application) => void;
  onEditApp: (app: Application) => void;
  onDeleteApp: (app: Application) => void;
  onFinalizeApp: (app: Application) => void;
}

export default function ApplicationCard({
  app,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onEditApp,
  onDeleteApp,
  onFinalizeApp,
}: ApplicationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false); // to avoid repeated fetches

  const toggleDetails = () => {
    setIsOpen((prev) => !prev);

    // fetch steps only the first time the card is expanded
    if (!loaded && !isOpen && app.id) {
      loadSteps();
    }
  };

  const loadSteps = async () => {
    setLoading(true);
    try {
      const data: ApplicationStep[] = await fetchApplicationSteps(app.id);
      const formatted: Step[] = data.map((s) => ({
        id: s.id.toString(),
        step_id: s.step_id.toString(),
        step_name: s.step_name,
        step_date: s.step_date,
        observation: s.observation,
        step_color: s.step_color || "#4ade80",
      }));
      setSteps(formatted);
      setLoaded(true);
    } catch (err) {
      console.error("Error loading steps:", err);
      setSteps([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transition-all duration-300 w-full rounded-2xl p-8 my-1 bg-white/5 border border-white/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:-translate-y-0.5">
      {/* Card header & actions */}
      <div className="flex justify-between items-center gap-4 min-h-[45px]">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <h3 className="text-white font-semibold text-base truncate">{app.company}</h3>
          <span className="text-white/70 text-sm truncate">{app.role}</span>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center min-w-0 text-center">
          {/* badges here */}
        </div>

        <div className="flex items-center justify-end gap-2 min-w-[80px] text-white/80">
          <button onClick={() => onAddStep(app)} className="text-sky-500 hover:text-sky-600 transition-transform duration-300 hover:scale-110">
            <i className="fa-solid fa-plus" />
          </button>
          <button onClick={() => onFinalizeApp(app)} className="text-amber-500 hover:text-amber-600 transition-transform duration-300 hover:scale-110">
            <i className="fa-solid fa-flag-checkered" />
          </button>
          <button onClick={() => onEditApp(app)} className="hover:text-white transition-transform duration-300 hover:scale-110">
            <i className="fa-solid fa-pen-to-square" />
          </button>
          <button onClick={() => onDeleteApp(app)} className="text-red-500 hover:text-red-600 transition-transform duration-300 hover:scale-110">
            <i className="fa-solid fa-trash" />
          </button>
          <button onClick={toggleDetails} className="text-white hover:text-white/80 transition-transform duration-300 hover:scale-110">
            <i className={`fa-solid ${isOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
          </button>
        </div>
      </div>

      {/* Card details */}
      <CardDetails
        isOpen={isOpen}
        id={app.id}
        expected_salary={app.salary_range_min}
        salary_offer={app.salary_range_max}
        mode="Remote"
        last_step_date={steps.length ? steps[steps.length - 1].step_date : "N/A"}
        feedback_date="2025-09-30"
        observation="Placeholder observation"
        steps={steps}
        onEditStep={(step) => onEditStep(step, app)}
        onDeleteStep={(step) => onDeleteStep(step, app)}
      />

      {loading && (
        <div className="text-white/50 text-xs mt-2">Loading steps...</div>
      )}
    </div>
  );
}
