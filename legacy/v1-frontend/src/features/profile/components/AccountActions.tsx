"use client";
import { useState } from "react";
import {Button} from "@/components/ui/Button";
import DeleteAccountModal from "../modals/DeleteAccountModal";

export default function AccountActions() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete Account
      </Button>
      {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
    </div>
  );
}
