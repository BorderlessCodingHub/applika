"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminPlatforms,
  useCreateAdminPlatform,
  useUpdateAdminPlatform,
  useDeleteAdminPlatform,
  usePublishPlatform,
} from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminPlatform } from "@/services/types/admin";
import { safeErrorMessage } from "@/components/application-drafts/draft-copy";
import {
  AddedBy,
  VisibilityFilter,
  visibilityParam,
  type CatalogVisibility,
} from "@/components/admin/catalog-visibility";
import { ApproveCatalogButton } from "@/components/admin/approve-catalog-button";
import { OnlyYouBadge } from "@/components/applications/only-you-badge";

/**
 * Admin supports page (PRD 0008, ADR 0012, R-021): step and feedback
 * definitions are gone — the timeline's hardcoded event/interview types
 * replaced them, and `/admin/step-definitions*` /
 * `/admin/feedback-definitions*` now 404. Platforms are unaffected and stay
 * the page's only section (a former tab bar with a single tab would be dead
 * chrome, so it renders directly).
 */
export function SupportsPage() {
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
          Supports Data
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage platforms used across the platform
        </p>
      </motion.div>

      <PlatformsTab />
    </div>
  );
}

// ── Platforms Tab ────────────────────────────────────────────────────

const platformSchema = z.object({
  name: z.string().min(1, "Name is required"),
  url: z.string().optional(),
});
type PlatformFormValues = z.infer<typeof platformSchema>;

function PlatformsTab() {
  const [visibility, setVisibility] = useState<CatalogVisibility>("all");
  const { data: platforms, isLoading } = useAdminPlatforms({
    visibility: visibilityParam(visibility),
  });
  const createMutation = useCreateAdminPlatform();
  const updateMutation = useUpdateAdminPlatform();
  const deleteMutation = useDeleteAdminPlatform();
  const publishMutation = usePublishPlatform();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminPlatform | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPlatform | null>(null);

  const createForm = useForm<PlatformFormValues>({
    resolver: zodResolver(platformSchema),
    defaultValues: { name: "", url: "" },
  });

  const editForm = useForm<PlatformFormValues>({
    resolver: zodResolver(platformSchema),
    defaultValues: { name: "", url: "" },
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VisibilityFilter value={visibility} onValueChange={setVisibility} />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Platform
        </Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-accent/20">
                <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                  Name
                </th>
                <th className="hidden px-3 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase md:table-cell">
                  URL
                </th>
                <th className="hidden px-3 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase md:table-cell">
                  Added by
                </th>
                <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {platforms?.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/20 transition-colors hover:bg-accent/30"
                >
                  <td className="px-5 py-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{p.name}</span>
                      {!p.is_public ? <OnlyYouBadge label="Private" /> : null}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">
                    {p.url || "—"}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <AddedBy username={p.created_by?.username} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!p.is_public ? (
                        <ApproveCatalogButton
                          kind="platform"
                          name={p.name}
                          url={p.url}
                          addedBy={p.created_by?.username}
                          onApprove={async () => {
                            try {
                              await publishMutation.mutateAsync(p.id);
                            } catch (error) {
                              return safeErrorMessage(
                                error,
                                "Could not approve it. Try again.",
                              );
                            }
                          }}
                          onApproved={() => {
                            // Orchestrator decision 3: move focus to the
                            // visibility filter once the trigger unmounts.
                            document
                              .querySelector<HTMLElement>(
                                '[data-slot="visibility-filter"]',
                              )
                              ?.focus();
                          }}
                        />
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditTarget(p);
                          editForm.reset({
                            name: p.name,
                            url: p.url ?? "",
                          });
                        }}
                        title="Edit platform details"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                        title="Delete platform"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Platform</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) =>
              createMutation.mutate(v, {
                onSuccess: () => {
                  setCreateOpen(false);
                  createForm.reset();
                },
              }),
            )}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...createForm.register("name")} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>URL (optional)</Label>
              <Input
                {...createForm.register("url")}
                placeholder="https://..."
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Platform</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit((v) =>
              updateMutation.mutate(
                { id: editTarget!.id, data: v },
                {
                  onSuccess: () => {
                    setEditTarget(null);
                    editForm.reset();
                  },
                },
              ),
            )}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...editForm.register("name")} />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input {...editForm.register("url")} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ""}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteMutation.mutate(deleteTarget!.id, {
            onSuccess: () => setDeleteTarget(null),
          })
        }
      />
    </>
  );
}

// ── Shared Delete Confirmation ──────────────────────────────────────

function ConfirmDeleteDialog({
  open,
  name,
  isPending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}</DialogTitle>
          <DialogDescription>
            Are you sure? If this entity is in use by any applications, the
            delete will fail with a conflict error.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
