"use client";

import { useState } from "react";
import type { ApplicationStep } from "@/services/types/applications";
import type { Application } from "@/services/types/applications";
import { useApplications } from "@/hooks/use-applications";
import { Search, Plus, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ApplicationFormSheet } from "@/components/shared/application-form-sheet";
import { ApplicationStepFormDialog } from "@/components/shared/application-step-form-dialog";
import { FinalizeDialog } from "@/components/shared/finalize-dialog";
import {
  ApplicationItem,
  ApplicationStepTimeline,
} from "@/components/shared/application-item";
import { Card } from "@/components/ui/card";

interface ApplicationAction {
  action:
    | "none"
    | "new"
    | "inspect"
    | "edit"
    | "delete"
    | "newStep"
    | "editStep"
    | "finalize";
  data?: Application | null;
  stepData?: ApplicationStep;
}

export function ApplicationsPage() {
  const {
    filtered,
    isLoading,
    filters,
    updateFilter,
    clearFilters,
    hasAdvancedFilters,
    deleteMutation,
    supports,
  } = useApplications();

  const [appAction, setAppAction] = useState<ApplicationAction>({
    action: "none",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  function handleNewClick() {
    setAppAction({ action: "new", data: undefined });
  }

  function handleEditClick(app: Application) {
    setAppAction({ action: "edit", data: app });
  }

  function handleFinalizeClick(app: Application) {
    setAppAction({ action: "finalize", data: app });
  }

  function handleStepClick(app: Application) {
    setAppAction({ action: "newStep", data: app });
  }

  function handleDeleteClick(app: Application) {
    setAppAction({ action: "delete", data: app });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground">
              Applications
            </h1>
            <p className="mt-0.5 text-base text-muted-foreground">
              {filtered.length} items
            </p>
          </div>
          <Button onClick={handleNewClick} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Application
          </Button>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search company or role…"
                value={filters.search ?? ""}
                onChange={(e) =>
                  updateFilter("search", e.target.value || undefined)
                }
                className="pl-9"
              />
            </div>

            <Select
              value={filters.status}
              onValueChange={(v) =>
                updateFilter("status", v as typeof filters.status)
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="finalized">Finalized</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={
                showAdvanced || hasAdvancedFilters ? "secondary" : "outline"
              }
              size="icon"
              onClick={() => setShowAdvanced((v) => !v)}
              title="Advanced filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <Card className="flex animate-fade-in-up flex-wrap items-end gap-4 bg-background p-3">
              <div className="space-y-1.5">
                <Label className="pl-1 text-sm text-muted-foreground">
                  Source
                </Label>

                <Select
                  value={filters.mode}
                  onValueChange={(v) =>
                    updateFilter("mode", v as typeof filters.mode)
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modes</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="passive">Passive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(supports?.platforms?.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  <Label className="pl-1 text-sm text-muted-foreground">
                    Platform
                  </Label>
                  <Select
                    value={
                      filters.platformId != null ? filters.platformId : "all"
                    }
                    onValueChange={(v) =>
                      updateFilter("platformId", v === "all" ? undefined : v)
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All platforms</SelectItem>
                      {supports?.platforms?.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="pl-1 text-sm text-muted-foreground">
                  From
                </Label>
                <Input
                  type="date"
                  value={
                    filters.dateRange?.start?.toISOString().split("T")[0] ?? ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateFilter("dateRange", undefined);
                    } else {
                      updateFilter("dateRange", {
                        start: new Date(val + "T00:00:00"),
                        end: filters.dateRange?.end ?? new Date(),
                      });
                    }
                  }}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="pl-1 text-sm text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={
                    filters.dateRange?.end?.toISOString().split("T")[0] ?? ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateFilter("dateRange", undefined);
                    } else {
                      updateFilter("dateRange", {
                        start:
                          filters.dateRange?.start ?? new Date("2020-01-01"),
                        end: new Date(val + "T00:00:00"),
                      });
                    }
                  }}
                  className="w-40"
                />
              </div>

              {hasAdvancedFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="gap-1.5 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
          <p className="pl-1 text-sm text-muted-foreground">
            No applications found
          </p>
          <Button
            onClick={handleNewClick}
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
          >
            <Plus className="h-4 w-4" /> Create your first application
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            return (
              <ApplicationItem
                key={app.id}
                app={app}
                onEditClick={handleEditClick}
                onNewStepClick={handleStepClick}
                onFinalizeClick={handleFinalizeClick}
                onDeleteClick={handleDeleteClick}
              >
                <ApplicationStepTimeline
                  id={app.id}
                  isDisabled={app.finalized}
                  stepsSupports={supports?.steps ?? []}
                  onEditStep={(step) =>
                    setAppAction({
                      action: "editStep",
                      data: app,
                      stepData: step,
                    })
                  }
                />
              </ApplicationItem>
            );
          })}
        </div>
      )}

      {/* Sheets & dialogs */}
      {appAction?.action == "new" && (
        <ApplicationFormSheet
          open={appAction.action === "new"}
          onOpenChange={() => setAppAction({ action: "none" })}
          application={null}
        />
      )}

      {appAction?.action == "edit" && (
        <ApplicationFormSheet
          open={appAction.action === "edit"}
          onOpenChange={() => setAppAction({ action: "none" })}
          application={appAction.data ?? null}
        />
      )}

      {appAction?.action === "newStep" && (
        <ApplicationStepFormDialog
          application={appAction.data!}
          steps={supports?.steps.filter((s) => !s.strict) ?? []}
          open={appAction.action === "newStep"}
          onOpenChange={() => setAppAction({ action: "none" })}
        />
      )}

      {appAction?.action === "editStep" && (
        <ApplicationStepFormDialog
          application={appAction.data!}
          steps={supports?.steps.filter((s) => !s.strict) ?? []}
          open={appAction.action === "editStep"}
          onOpenChange={() => setAppAction({ action: "none" })}
          editStep={appAction.stepData}
        />
      )}

      {appAction?.action === "finalize" && (
        <FinalizeDialog
          applicationId={appAction.data!.id}
          open={appAction.action === "finalize"}
          onOpenChange={() => setAppAction({ action: "none" })}
          steps={supports?.steps.filter((s) => s.strict) ?? []}
          feedbacks={supports?.feedbacks ?? []}
        />
      )}

      {appAction?.action === "delete" && (
        <AlertDialog
          open={appAction.action === "delete"}
          onOpenChange={() => setAppAction({ action: "none" })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete application?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(appAction.data!.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
