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
  useAdminStepDefinitions,
  useCreateAdminStepDefinition,
  useUpdateAdminStepDefinition,
  useDeleteAdminStepDefinition,
  useAdminFeedbackDefinitions,
  useCreateAdminFeedbackDefinition,
  useUpdateAdminFeedbackDefinition,
  useDeleteAdminFeedbackDefinition,
} from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import type {
  AdminFeedbackDefinition,
  AdminPlatform,
  AdminStepDefinition,
} from "@/services/types/admin";

type Tab = "platforms" | "steps" | "feedbacks";

const tabItems: { key: Tab; label: string }[] = [
  { key: "platforms", label: "Platforms" },
  { key: "steps", label: "Step Definitions" },
  { key: "feedbacks", label: "Feedback Definitions" },
];

export function SupportsPage() {
  const [tab, setTab] = useState<Tab>("platforms");

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
          Manage platforms, step definitions, and feedback definitions used
          across the platform
        </p>
      </motion.div>

      <div className="flex items-center gap-1 border-b border-border/40 pb-px">
        {tabItems.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-amber-400" />
            )}
          </button>
        ))}
      </div>

      {tab === "platforms" && <PlatformsTab />}
      {tab === "steps" && <StepDefinitionsTab />}
      {tab === "feedbacks" && <FeedbackDefinitionsTab />}
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
  const { data: platforms, isLoading } = useAdminPlatforms();
  const createMutation = useCreateAdminPlatform();
  const updateMutation = useUpdateAdminPlatform();
  const deleteMutation = useDeleteAdminPlatform();

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
      <div className="flex justify-end">
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
                <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Name
                </th>
                <th className="hidden px-3 py-2.5 text-left md:table-cell font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  URL
                </th>
                <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
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
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground md:table-cell">
                    {p.url || "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
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
              <Input {...createForm.register("url")} placeholder="https://..." />
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

// ── Step Definitions Tab ────────────────────────────────────────────

const stepSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().min(4, "Color is required"),
  strict: z.boolean(),
});
type StepFormValues = z.infer<typeof stepSchema>;

function StepDefinitionsTab() {
  const { data: steps, isLoading } = useAdminStepDefinitions();
  const createMutation = useCreateAdminStepDefinition();
  const updateMutation = useUpdateAdminStepDefinition();
  const deleteMutation = useDeleteAdminStepDefinition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminStepDefinition | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<AdminStepDefinition | null>(
    null,
  );

  const createForm = useForm<StepFormValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: { name: "", color: "#007bff", strict: false },
  });

  const editForm = useForm<StepFormValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: { name: "", color: "#007bff", strict: false },
  });

  return (
    <>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Step
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
                <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Name
                </th>
                <th className="px-3 py-2.5 text-center font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Color
                </th>
                <th className="px-3 py-2.5 text-center font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Type
                </th>
                <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {steps?.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border/20 transition-colors hover:bg-accent/30"
                >
                  <td className="px-5 py-3 font-medium">{s.name}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-border/40"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {s.color}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        s.strict
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-sky-500/30 bg-sky-500/10 text-sky-400",
                      )}
                    >
                      {s.strict ? "strict" : "regular"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditTarget(s);
                          editForm.reset({
                            name: s.name,
                            color: s.color,
                            strict: s.strict,
                          });
                        }}
                        title="Edit step definition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                        title="Delete step definition"
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
            <DialogTitle>Add Step Definition</DialogTitle>
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
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...createForm.register("color")}
                  className="h-8 w-10 cursor-pointer rounded border border-border"
                />
                <Input
                  {...createForm.register("color")}
                  className="flex-1"
                  placeholder="#007bff"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="create-strict"
                {...createForm.register("strict")}
                className="h-4 w-4 rounded border border-border accent-amber-500"
              />
              <Label htmlFor="create-strict">
                Strict (finalization-only step)
              </Label>
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
            <DialogTitle>Edit Step Definition</DialogTitle>
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
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...editForm.register("color")}
                  className="h-8 w-10 cursor-pointer rounded border border-border"
                />
                <Input {...editForm.register("color")} className="flex-1" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-strict"
                {...editForm.register("strict")}
                className="h-4 w-4 rounded border border-border accent-amber-500"
              />
              <Label htmlFor="edit-strict">Strict</Label>
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

// ── Feedback Definitions Tab ────────────────────────────────────────

const feedbackSchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().min(4, "Color is required"),
});
type FeedbackFormValues = z.infer<typeof feedbackSchema>;

function FeedbackDefinitionsTab() {
  const { data: feedbacks, isLoading } = useAdminFeedbackDefinitions();
  const createMutation = useCreateAdminFeedbackDefinition();
  const updateMutation = useUpdateAdminFeedbackDefinition();
  const deleteMutation = useDeleteAdminFeedbackDefinition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] =
    useState<AdminFeedbackDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminFeedbackDefinition | null>(null);

  const createForm = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { name: "", color: "#28a745" },
  });

  const editForm = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { name: "", color: "#28a745" },
  });

  return (
    <>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Feedback
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
                <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Name
                </th>
                <th className="px-3 py-2.5 text-center font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Color
                </th>
                <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {feedbacks?.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-border/20 transition-colors hover:bg-accent/30"
                >
                  <td className="px-5 py-3 font-medium">{f.name}</td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-border/40"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {f.color}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditTarget(f);
                          editForm.reset({ name: f.name, color: f.color });
                        }}
                        title="Edit feedback definition details"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(f)}
                        title="Delete feedback definition"
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
            <DialogTitle>Add Feedback Definition</DialogTitle>
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
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...createForm.register("color")}
                  className="h-8 w-10 cursor-pointer rounded border border-border"
                />
                <Input {...createForm.register("color")} className="flex-1" />
              </div>
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
            <DialogTitle>Edit Feedback Definition</DialogTitle>
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
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  {...editForm.register("color")}
                  className="h-8 w-10 cursor-pointer rounded border border-border"
                />
                <Input {...editForm.register("color")} className="flex-1" />
              </div>
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
