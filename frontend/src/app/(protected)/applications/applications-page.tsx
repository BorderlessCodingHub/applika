"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAxiosError, type AxiosError } from "axios";
import { toast } from "sonner";
import type { Application } from "@/services/types/applications";
import {
  useApplicationDelete,
  useApplications,
} from "@/hooks/use-applications";
import { useReopenApplication } from "@/hooks/use-reopen-application";
import { getApiError } from "@/lib/api-client";
import {
  Briefcase,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { FinalizeDialog } from "@/components/applications/finalize-dialog";
import { ApplicationItem } from "@/components/applications/application-item";
import { NewApplicationActions } from "@/components/applications/new-application-actions";
import { DraftsSection } from "@/components/application-drafts/drafts-section";
import { useDeleteDraft, useDrafts } from "@/hooks/use-application-drafts";
import { ApplicationCardSkeleton } from "@/components/applications/application-card-skeleton";
import {
  APPLICATIONS_PAGE_COPY,
  foundApplicationsLabel,
} from "@/components/applications/application-card-copy";
import { EmptyState } from "@/components/common/empty-state";
import { DatePickerInput } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCycleContext } from "@/contexts/cycle-context";
import { scrollIntoContainer } from "@/lib/scroll-into-container";

interface ApplicationAction {
  action: "none" | "new" | "inspect" | "edit" | "delete" | "finalize";
  data?: Application | null;
}

export function ApplicationsPage() {
  const { selectedCycleId, isViewingPastCycle } = useCycleContext();
  const {
    filtered,
    isLoading,
    isError,
    refetch,
    filters,
    updateFilter,
    clearFilters,
    hasAdvancedFilters,
    hasAnyFilter,
    supports,
  } = useApplications(selectedCycleId);
  const { deleteApplication } = useApplicationDelete();
  const reopenApplication = useReopenApplication();

  const [appAction, setAppAction] = useState<ApplicationAction>({
    action: "none",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const advancedPanelId = useId();

  // `?focus=` (R-011, KODI-038): read once, off the incoming URL, via a LAZY
  // useState initializer — never an effect (`react-hooks/set-state-in-effect`).
  const searchParams = useSearchParams();
  const [focusId] = useState<string | null>(() => searchParams.get("focus"));
  // Guards React Strict Mode's deliberate double-invoke of effects: the
  // notice/replaceState side effects below must fire at most once.
  const focusResolved = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  // Set once the scroll+focus effect actually runs (below). Without this, a
  // row that gets hidden and shown again — a filter change, a cycle switch,
  // a background refetch — would recompute `focusRowId` as truthy forever
  // and re-steal scroll/focus on every remount (frontend-qa B1).
  const [focusDone, setFocusDone] = useState(false);

  // Derived, not stored in state, and computed EVERY render: the row to
  // expand has to be known on the very render that first mounts it (the one
  // where `isLoading` flips to `false`), because `ApplicationItem`'s
  // `defaultExpanded` only seeds its OWN initial state — a prop change to an
  // already-mounted row would not reopen it. Recomputing it in a `useState`
  // set from an effect one render later would always be one render too late.
  const focusRowId =
    focusId &&
    !focusDone &&
    !isLoading &&
    filtered.some((app) => app.id === focusId)
      ? focusId
      : null;

  useEffect(() => {
    // `isError` guards against a load failure being read as "not in the
    // list": with `isLoading` false and `filtered` empty on error, this
    // would otherwise show the not-in-cycle notice on every failed load
    // (frontend-qa B3) instead of leaving the resolution for the retry.
    if (!focusId || focusResolved.current || isLoading || isError) return;
    focusResolved.current = true;

    if (!filtered.some((app) => app.id === focusId)) {
      toast.info(APPLICATIONS_PAGE_COPY.focusNotInCycle, {
        id: "applications-focus-not-in-cycle",
        richColors: false,
        duration: 6000,
      });
    }
    // Static export (`output: "export"`): `router.replace()` to the same
    // path with only the query string changed is a no-op here (see
    // `profile-page.tsx`'s note) — drive the History API directly.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/applications");
    }
  }, [focusId, isLoading, isError, filtered]);

  // Scroll the focused row into view and focus its details trigger, once the
  // row's `<article>` is actually in the DOM (`ApplicationItem` returns
  // `null` until `useSupports()` resolves — hence the `supports` guard AND
  // dependency below, not just the `requestAnimationFrame`: without it the
  // effect can run and give up a frame before `supports` ever arrives, and
  // its `[focusRowId]` deps would never call it again, frontend-qa B2) — a
  // single `requestAnimationFrame` after the render that first computes
  // `focusRowId`, the same "wait a frame, then re-query by a stable data
  // attribute" pattern used in `cv-removed-row.tsx`/`cv-changed-marker.tsx`.
  useEffect(() => {
    if (!focusRowId || !supports) return;
    const container = listRef.current;
    const frame = requestAnimationFrame(() => {
      if (!container?.isConnected) return;
      const row = Array.from(
        container.querySelectorAll<HTMLLIElement>("li[data-application-id]"),
      ).find((element) => element.dataset.applicationId === focusRowId);
      if (!row || !row.querySelector("article")) return;
      // Not `row.scrollIntoView()`: it also scrolls the shell's
      // `overflow-hidden` root and shifts the whole layout up.
      scrollIntoContainer(
        row,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      );
      row
        .querySelector<HTMLButtonElement>(
          '[data-slot="application-item-details-trigger"]',
        )
        ?.focus({ preventScroll: true });
      setFocusDone(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRowId, supports]);

  // Drafts (PRD 0010, AC11): shown only where the create actions are — the
  // current cycle, hidden on an archived one, per the orchestrator's decision.
  const draftsQuery = useDrafts();
  const deleteDraft = useDeleteDraft();

  function handleDeleteDraft(draft: { id: string }) {
    setDeletingDraftId(draft.id);
    deleteDraft.mutate(draft.id, {
      onSuccess: () => {
        toast.success("Draft deleted");
        setDeletingDraftId(null);
      },
      onError: (error) => {
        toast.error(
          isAxiosError(error) ? getApiError(error) : "Could not delete it",
        );
        setDeletingDraftId(null);
      },
    });
  }

  function handleNewClick() {
    setAppAction({ action: "new", data: undefined });
  }

  function handleEditClick(app: Application) {
    setAppAction({ action: "edit", data: app });
  }

  function handleFinalizeClick(app: Application) {
    setAppAction({ action: "finalize", data: app });
  }

  function handleDeleteClick(app: Application) {
    setAppAction({ action: "delete", data: app });
  }

  function handleReopenClick(app: Application) {
    setReopeningId(app.id);
    reopenApplication.mutate(app.id, {
      onSuccess: () => {
        toast.success("Application reopened");
        setReopeningId(null);
      },
      onError: (error) => {
        toast.error(
          isAxiosError(error) ? getApiError(error) : "Could not reopen it",
        );
        setReopeningId(null);
      },
    });
  }

  // AC8 / design section 6: the count shows only once the query has
  // succeeded (0 included) — while loading or on error the tab's accessible
  // name stays plain "Drafts" rather than falsely claiming a count of 0.
  const draftsCount = draftsQuery.isSuccess
    ? (draftsQuery.data?.length ?? 0)
    : undefined;

  const toolbarAndFilters = (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-0">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={APPLICATIONS_PAGE_COPY.searchPlaceholder}
            aria-label={APPLICATIONS_PAGE_COPY.searchLabel}
            value={filters.search ?? ""}
            onChange={(e) =>
              updateFilter("search", e.target.value || undefined)
            }
            className="h-11 pl-10"
          />
        </div>

        <Select
          value={filters.status}
          onValueChange={(v) =>
            updateFilter("status", v as typeof filters.status)
          }
        >
          <SelectTrigger
            aria-label={APPLICATIONS_PAGE_COPY.statusFilterLabel}
            className="h-11 flex-1 data-[size=default]:h-11 sm:w-44 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {APPLICATIONS_PAGE_COPY.allStatuses}
            </SelectItem>
            <SelectItem value="active">Active</SelectItem>
            {/* G6: option label reads "Closed"; the value stays "finalized". */}
            <SelectItem value="finalized">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showAdvanced || hasAdvancedFilters ? "secondary" : "outline"}
          size="icon"
          className="size-11"
          onClick={() => setShowAdvanced((v) => !v)}
          title={APPLICATIONS_PAGE_COPY.advancedFilters}
          aria-label={APPLICATIONS_PAGE_COPY.advancedFilters}
          aria-expanded={showAdvanced}
          aria-controls={advancedPanelId}
        >
          <SlidersHorizontal aria-hidden />
        </Button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div
          id={advancedPanelId}
          className="grid animate-fade-in-up grid-cols-2 items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-card motion-reduce:animate-none sm:flex sm:flex-wrap"
        >
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
            <Label htmlFor="applications-filter-mode">Source</Label>
            <Select
              value={filters.mode}
              onValueChange={(v) =>
                updateFilter("mode", v as typeof filters.mode)
              }
            >
              <SelectTrigger id="applications-filter-mode">
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
            <div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
              <Label htmlFor="applications-filter-platform">Platform</Label>
              <Select
                value={filters.platformId != null ? filters.platformId : "all"}
                onValueChange={(v) =>
                  updateFilter("platformId", v === "all" ? undefined : v)
                }
              >
                <SelectTrigger id="applications-filter-platform">
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

          <div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
            <Label htmlFor="applications-filter-from">From</Label>
            <DatePickerInput
              id="applications-filter-from"
              value={filters.dateRange?.start}
              maxDate={new Date()}
              onChange={(value) => {
                if (!value) {
                  updateFilter("dateRange", undefined);
                } else {
                  updateFilter("dateRange", {
                    start: value,
                    end: filters.dateRange?.end,
                  });
                }
              }}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:w-44">
            <Label htmlFor="applications-filter-to">To</Label>
            <DatePickerInput
              id="applications-filter-to"
              value={filters.dateRange?.end}
              maxDate={new Date()}
              onChange={(value) => {
                if (!value) {
                  updateFilter("dateRange", undefined);
                } else {
                  updateFilter("dateRange", {
                    start: filters.dateRange?.start,
                    end: value,
                  });
                }
              }}
            />
          </div>

          {hasAdvancedFilters && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              className="col-span-2 gap-1.5 text-muted-foreground sm:col-span-1"
            >
              <X aria-hidden data-icon="inline-start" />
              {APPLICATIONS_PAGE_COPY.clearFilters}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const applicationsList = (
    <>
      {isError ? (
        <EmptyState
          icon={RefreshCw}
          title="We couldn't load applications"
          description="Something went wrong fetching your applications."
          action={
            <Button onClick={() => void refetch()}>
              <RefreshCw aria-hidden />
              Retry
            </Button>
          }
        />
      ) : isLoading ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          {[...Array(5)].map((_, i) => (
            <ApplicationCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={APPLICATIONS_PAGE_COPY.emptyTitle}
          action={
            !isViewingPastCycle && !hasAnyFilter ? (
              <Button onClick={handleNewClick} variant="outline">
                <Plus aria-hidden data-icon="inline-start" />
                {APPLICATIONS_PAGE_COPY.emptyAction}
              </Button>
            ) : hasAnyFilter ? (
              <Button variant="ghost" onClick={clearFilters}>
                {APPLICATIONS_PAGE_COPY.clearFilters}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {foundApplicationsLabel(filtered.length)}
          </p>
          <ul ref={listRef} className="flex flex-col gap-4">
            {filtered.map((app) => (
              <li
                key={app.id}
                data-application-id={app.id}
                className="scroll-mt-6 md:scroll-mt-8"
              >
                <ApplicationItem
                  app={app}
                  defaultExpanded={app.id === focusRowId}
                  onEditClick={isViewingPastCycle ? undefined : handleEditClick}
                  onFinalizeClick={
                    isViewingPastCycle ? undefined : handleFinalizeClick
                  }
                  onDeleteClick={
                    isViewingPastCycle ? undefined : handleDeleteClick
                  }
                  onReopenClick={
                    isViewingPastCycle ? undefined : handleReopenClick
                  }
                  reopenPending={
                    reopeningId === app.id && reopenApplication.isPending
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground sm:text-3xl">
            {APPLICATIONS_PAGE_COPY.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isViewingPastCycle
              ? APPLICATIONS_PAGE_COPY.archivedSubtitle
              : APPLICATIONS_PAGE_COPY.subtitle}
          </p>
        </div>
        {!isViewingPastCycle && (
          <NewApplicationActions onNewApplication={handleNewClick} />
        )}
      </div>

      {isViewingPastCycle ? (
        <div className="flex flex-col gap-4">
          {toolbarAndFilters}
          {applicationsList}
        </div>
      ) : (
        <Tabs defaultValue="applications" className="gap-4">
          <TabsList variant="line">
            <TabsTrigger value="applications">
              {APPLICATIONS_PAGE_COPY.applicationsTab}
            </TabsTrigger>
            <TabsTrigger
              value="drafts"
              aria-label={
                draftsCount === undefined
                  ? undefined
                  : `${APPLICATIONS_PAGE_COPY.draftsTab} (${draftsCount})`
              }
            >
              {APPLICATIONS_PAGE_COPY.draftsTab}
              {draftsCount !== undefined && (
                <Badge
                  aria-hidden="true"
                  variant="secondary"
                  className="font-numeric"
                >
                  {draftsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="applications" className="flex flex-col gap-4">
            {toolbarAndFilters}
            {applicationsList}
          </TabsContent>
          <TabsContent value="drafts">
            <DraftsSection
              drafts={draftsQuery.data}
              isLoading={draftsQuery.isLoading}
              error={
                draftsQuery.isError
                  ? getApiError(draftsQuery.error as AxiosError)
                  : null
              }
              onRetry={() => void draftsQuery.refetch()}
              onDelete={handleDeleteDraft}
              deletingId={deletingDraftId}
            />
          </TabsContent>
        </Tabs>
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

      {appAction?.action === "finalize" && (
        <FinalizeDialog
          applicationId={appAction.data!.id}
          open={appAction.action === "finalize"}
          onOpenChange={() => setAppAction({ action: "none" })}
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
                onClick={() => deleteApplication(appAction.data!.id)}
                variant="destructive"
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
