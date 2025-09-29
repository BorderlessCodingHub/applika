import React from 'react';
import ApplicationCard from './applications/ApplicationCard';
import useApplicationModals from '../hooks/useApplicationModals';
import AddStepModal from './applications/steps/AddStepModal';
import EditStepModal from './applications/steps/EditStepModal';
import DeleteStepModal from './applications/steps/DeleteStepModal';

export default function ApplicationsGrid({ applications }) {
  const modal = useApplicationModals();

  return (
    <div className="grid grid-cols-1 gap-4">
      {applications.map(app => (
        <ApplicationCard
          key={app.id}
          app={app}
          onAddStep={modal.openAddStep}
          onEditStep={modal.openEditStep}
          onDeleteStep={modal.openDeleteStep}
          onEditApp={modal.openEditApp}
          onDeleteApp={modal.openDeleteApp}
          onFinalizeApp={modal.openFinalizeApp}
        />
      ))}

      <AddStepModal isOpen={modal.addStepOpen} onClose={() => modal.setAddStepOpen(false)} steps={[]} applicationInfo={modal.selectedApplication?.company ?? ''} onSubmit={() => {}} />
      {modal.selectedStep && (
        <EditStepModal isOpen={modal.editStepOpen} onClose={() => modal.setEditStepOpen(false)} steps={[]} initialData={modal.selectedStep} onSubmit={() => {}} />
      )}
      {modal.selectedStep && (
        <DeleteStepModal isOpen={modal.deleteStepOpen} stepName={modal.selectedStep.step_name} stepDate={modal.selectedStep.step_date} onClose={() => modal.setDeleteStepOpen(false)} onConfirm={() => {}} />
      )}
    </div>
  );
}
