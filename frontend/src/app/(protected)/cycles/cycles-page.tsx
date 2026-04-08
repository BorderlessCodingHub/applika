"use client";

import { useState } from "react";
import { Eye, History, Trash2 } from "lucide-react";
import { useCycles, useDeleteCycle } from "@/hooks/use-cycles";
import { useCycleContext } from "@/contexts/cycle-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Cycle } from "@/services/types/cycles";
import { useRouter } from "next/navigation";

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CyclesPage() {
  const { data: cycles, isLoading } = useCycles();
  const { setSelectedCycleId } = useCycleContext();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Cycle | null>(null);

  const deleteMutation = useDeleteCycle({
    onSuccess: () => {
      setDeleteTarget(null);
      setSelectedCycleId(null);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Cycles
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your archived job search cycles. Deleting a cycle permanently
          removes all its applications, reports, and statistics.
        </p>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : !cycles || cycles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
          <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No archived cycles yet
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
            When you start a new cycle from the header, your current
            applications and reports will be archived here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4 transition-colors hover:bg-accent/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15">
                <History className="h-5 w-5 text-primary" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">
                  {cycle.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Created {formatDate(cycle.created_at)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedCycleId(cycle.id);
                    router.push("/dashboard");
                  }}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget(cycle)}
                  className="gap-1.5 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cycle permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-justify">
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              and all its associated applications, reports, and statistics. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
