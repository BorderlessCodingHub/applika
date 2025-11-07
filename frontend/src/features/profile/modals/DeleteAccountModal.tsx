"use client";
import {Button} from "@/components/ui/Button";

export default function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm text-black">
        <h3 className="text-lg font-semibold mb-4">Delete Account</h3>
        <p className="text-sm mb-4">
          Are you sure you want to delete your account? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">Cancel</Button>
          <Button variant="danger">Delete</Button>
        </div>
      </div>
    </div>
  );
}
