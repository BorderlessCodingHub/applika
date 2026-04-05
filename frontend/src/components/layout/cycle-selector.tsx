"use client";

import { useState } from "react";
import { RefreshCw, Plus, History } from "lucide-react";
import {
  Select,
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

export function CycleSelector() {
  const { selectedCycleId, setSelectedCycleId } = useCycleContext();
  const { data: cycles } = useCycles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cycleName, setCycleName] = useState("");

  const createCycle = useCreateCycle({
    onSuccess: () => {
      setDialogOpen(false);
      setCycleName("");
      setSelectedCycleId(null);
    },
  });

  const hasCycles = cycles && cycles.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleName.trim()) return;
    createCycle.mutate({ name: cycleName.trim() });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {hasCycles && (
          <Select
            value={selectedCycleId ?? "current"}
            onValueChange={(v) =>
              setSelectedCycleId(v === "current" ? null : v)
            }
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <History className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Cycle</SelectItem>
              {cycles.map((cycle) => (
                <SelectItem key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setDialogOpen(true)}
        >
          {hasCycles ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Cycle
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Start a New Cycle</DialogTitle>
              <DialogDescription>
                All current applications and reports will be archived under a
                named cycle. You can switch back to view them anytime.
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
