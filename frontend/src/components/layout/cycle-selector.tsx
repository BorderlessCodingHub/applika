"use client";

import { useState } from "react";
import { RefreshCw, Plus, History } from "lucide-react";
import {
  Select,
  SelectButton,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCycleContext } from "@/contexts/cycle-context";
import { useCycles, useCreateCycle } from "@/hooks/use-cycles";
import { useGeneralStats } from "@/hooks/use-statistics";
import { cn } from "@/lib/utils";

const MIN_APPLICATIONS_FOR_CYCLE = 10;

export function CycleSelector({ className }: { className?: string }) {
  const { selectedCycleId, setSelectedCycleId } = useCycleContext();
  const { data: cycles } = useCycles();
  const { data: stats } = useGeneralStats();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cycleName, setCycleName] = useState("");

  const createCycle = useCreateCycle({
    onSuccess: () => {
      setDialogOpen(false);
      setCycleName("");
      setSelectedCycleId(null);
    },
  });

  const currentApps = stats?.total_applications ?? 0;
  const canCreateCycle = currentApps >= MIN_APPLICATIONS_FOR_CYCLE;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleName.trim()) return;
    createCycle.mutate({ name: cycleName.trim() });
  }

  return (
    <>
      <div className={cn("flex items-center gap-2 w-full lg:max-w-96", className)}>
        <Select
          value={selectedCycleId ?? "current"}
          onValueChange={(v) => setSelectedCycleId(v === "current" ? null : v)}
        >
          <SelectTrigger className="mx-auto">
            <History className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Cycle</SelectItem>
            {(cycles || []).map((cycle) => (
              <SelectItem key={cycle.id} value={cycle.id}>
                {cycle.name}
              </SelectItem>
            ))}
            {canCreateCycle && (
              <SelectButton
                className="gap-1.5 w-full"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                New Cycle
              </SelectButton>
            )}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Start a New Cycle</DialogTitle>
              <DialogDescription className="text-justify">
                All current applications and reports will be permanently
                archived under a named cycle. This action cannot be undone, but
                the archived data will only be available for viewing.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <Input
                placeholder="e.g. Q1 2026, Job Search Round 2..."
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!cycleName.trim() || createCycle.isPending}
              >
                {createCycle.isPending ? "Creating..." : "Start Cycle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
