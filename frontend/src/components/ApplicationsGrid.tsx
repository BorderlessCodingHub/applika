"use client";

import React, { useState } from "react";
import CardDetails from "./CardDetails";
import AddStepModal from "./AddStepModal";
import FinalizeApplicationModal from "./FinalizeApplicationModal";
import EditApplicationModal from "./EditApplicationModal";
import DeleteApplicationModal from "./DeleteApplicationModal"; // Import

type Application = {
  id: string;
  company: string;
  role: string;
  application_date: string;
  platform_name: string;
  step_name: string;
  step_color: string;
  feedback_name: string;
  feedback_color: string;
  salary_range_min: number;
  salary_range_max: number;
};

interface ApplicationsGridProps {
  applications: Application[];
}

export default function ApplicationsGrid({
  applications,
}: ApplicationsGridProps) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [addStepModalOpen, setAddStepModalOpen] = useState(false);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false); // new state
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);

  const toggleDetails = (id: string) =>
    setOpenCardId((prev) => (prev === id ? null : id));

  const handleAddStepClick = (app: Application) => {
    setSelectedApplication(app);
    setAddStepModalOpen(true);
  };

  const handleFinalizeClick = (app: Application) => {
    setSelectedApplication(app);
    setFinalizeModalOpen(true);
  };

  const handleEditClick = (app: Application) => {
    setSelectedApplication(app);
    setEditModalOpen(true);
  };

  const handleDeleteClick = (app: Application) => {
    setSelectedApplication(app);
    setDeleteModalOpen(true);
  };

  const handleStepSubmit = (data: any) => {
    console.log("Add step for application:", selectedApplication?.id, data);
    setAddStepModalOpen(false);
  };

  const handleFinalizeSubmit = (data: any) => {
    console.log("Finalize application:", selectedApplication?.id, data);
    setFinalizeModalOpen(false);
  };

  const handleEditSubmit = (data: any) => {
    console.log("Edit application:", selectedApplication?.id, data);
    setEditModalOpen(false);
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    console.log("Delete application:", id);
    // Perform actual delete logic here (API call)
    setDeleteModalOpen(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {applications.map((app) => {
        const isOpen = openCardId === app.id;
        return (
          <div
            key={app.id}
            className="transition-all duration-300 w-full rounded-2xl p-8 my-1 bg-white/5 border border-white/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:-translate-y-0.5"
          >
            {/* Card Header & Info */}
            <div className="flex justify-between items-center gap-4 min-h-[45px]">
              <div className="flex flex-col gap-1 min-w-[180px]">
                <h3 className="text-white font-semibold text-base truncate">
                  {app.company}
                </h3>
                <span className="text-white/70 text-sm truncate">
                  {app.role}
                </span>
              </div>
              {/* Information Section */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-center min-w-0 text-center">
                {/* Application Date */}
                <span className="block text-xs text-white/80 sm:col-span-2 md:col-span-1 md:text-left sm:text-center">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-white/60 font-semibold mb-1">
                    Date
                  </span>
                  {app.application_date}
                </span>

                {/* Platform Badge */}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md border border-white/30 bg-white/10 text-white/80">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-white/60 font-semibold mb-1">
                    Platform
                  </span>
                  {app.platform_name}
                </span>

                {/* Step Badge */}
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-md border"
                  style={{
                    backgroundColor: `${app.step_color}33`,
                    color: app.step_color,
                    borderColor: `${app.step_color}55`,
                  }}
                >
                  <span className="block text-[0.65rem] uppercase tracking-wide text-white/60 font-semibold mb-1">
                    Status
                  </span>
                  {app.step_name}
                </span>

                {/* Feedback Badge */}
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-md border"
                  style={{
                    backgroundColor: `${app.feedback_color}33`,
                    color: app.feedback_color,
                    borderColor: `${app.feedback_color}55`,
                  }}
                >
                  <span className="block text-[0.65rem] uppercase tracking-wide text-white/60 font-semibold mb-1">
                    Feedback
                  </span>
                  {app.feedback_name}
                </span>

                {/* Salary Range */}
                <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-white/60 font-semibold mb-1">
                    Range Salary
                  </span>
                  ${app.salary_range_min}k - ${app.salary_range_max}k
                </span>

                {/* Placeholder for spacing on large screens */}
                <span className="hidden lg:block"></span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 min-w-[80px] text-white/80">
                <button
                  onClick={() => handleAddStepClick(app)}
                  className="text-sky-500 hover:text-sky-600 transition-transform duration-300 hover:scale-110"
                >
                  <i className="fa-solid fa-plus" />
                </button>
                <button
                  onClick={() => handleFinalizeClick(app)}
                  className="text-amber-500 hover:text-amber-600 transition-transform duration-300 hover:scale-110"
                >
                  <i className="fa-solid fa-flag-checkered" />
                </button>
                <button
                  onClick={() => handleEditClick(app)}
                  className="hover:text-white transition-transform duration-300 hover:scale-110"
                >
                  <i className="fa-solid fa-pen-to-square" />
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDeleteClick(app)}
                  className="text-red-500 hover:text-red-600 transition-transform duration-300 hover:scale-110"
                >
                  <i className="fa-solid fa-trash" />
                </button>
                <button
                  onClick={() => toggleDetails(app.id)}
                  className="text-white hover:text-white/80 transition-transform duration-300 hover:scale-110"
                >
                  <i
                    className={`fa-solid ${
                      isOpen ? "fa-chevron-up" : "fa-chevron-down"
                    }`}
                  />
                </button>
              </div>
            </div>

            <CardDetails
              isOpen={isOpen}
              id={app.id}
              expected_salary={app.salary_range_min}
              salary_offer={app.salary_range_max}
              mode="Remote"
              last_step_date="2025-09-26"
              feedback_date="2025-09-30"
              observation="Placeholder observation"
              steps={[
                {
                  id: "1",
                  step_id: "s1",
                  step_name: "Initial Interview",
                  step_date: "2025-09-20",
                  observation: "Strong communication.",
                  step_color: "#4ade80",
                },
              ]}
            />
          </div>
        );
      })}

      <AddStepModal
        isOpen={addStepModalOpen}
        onClose={() => setAddStepModalOpen(false)}
        steps={[
          { id: "s1", name: "Initial Interview" },
          { id: "s2", name: "Technical Test" },
          { id: "s3", name: "HR Interview" },
        ]}
        applicationInfo={
          selectedApplication
            ? `${selectedApplication.company} - ${selectedApplication.role}`
            : ""
        }
        onSubmit={handleStepSubmit}
      />

      <FinalizeApplicationModal
        isOpen={finalizeModalOpen}
        onClose={() => setFinalizeModalOpen(false)}
        feedbacks={[
          { id: "f1", name: "Positive" },
          { id: "f2", name: "Neutral" },
          { id: "f3", name: "Negative" },
        ]}
        onSubmit={handleFinalizeSubmit}
      />

      <EditApplicationModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        platforms={[
          { id: "p1", name: "LinkedIn" },
          { id: "p2", name: "Indeed" },
          { id: "p3", name: "Glassdoor" },
        ]}
        initialData={
          selectedApplication
            ? {
                company: selectedApplication.company,
                role: selectedApplication.role,
                application_date: selectedApplication.application_date,
                platform_id: selectedApplication.platform_name,
                mode: "active",
                expected_salary: selectedApplication.salary_range_min,
                salary_range_min: selectedApplication.salary_range_min,
                salary_range_max: selectedApplication.salary_range_max,
                observation: "Placeholder observation",
              }
            : undefined
        }
        onSubmit={handleEditSubmit}
      />

      <DeleteApplicationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDelete={() => handleDelete(selectedApplication?.id)}
      />
    </div>
  );
}
