"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import {
  useAdminPlatforms,
  useCreateAdminPlatform,
  useUpdateAdminPlatform,
  useDeleteAdminPlatform,
  usePublishPlatform,
} from "@/hooks/use-admin";
import { safeErrorMessage } from "@/components/application-drafts/draft-copy";
import {
  visibilityParam,
  type CatalogVisibility,
} from "@/components/admin/catalog-visibility";
import { CatalogTable } from "@/components/admin/catalog-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdminPlatformRow } from "@/services/types/admin";

const PAGE_SIZE = 15;
const NAME_MAX = 100;
const URL_MAX = 200;

const platformSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(NAME_MAX, `Name must be ${NAME_MAX} characters or fewer`),
  url: z
    .string()
    .max(URL_MAX, `URL must be ${URL_MAX} characters or fewer`)
    .optional(),
});
type PlatformFormValues = z.infer<typeof platformSchema>;

/**
 * Admin platforms page (PRD 0010, KODI-035). Replaces `SupportsPage` — the
 * step/feedback definition catalogs are gone (PRD 0008/ADR 0012, R-021), so a
 * former tab bar with a single tab is now this page directly, on the same
 * `CatalogTable` the companies page uses.
 */
export function PlatformsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<CatalogVisibility>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminPlatformRow | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useAdminPlatforms({
    search: search || undefined,
    visibility: visibilityParam(visibility),
    page,
    per_page: PAGE_SIZE,
  });

  const createMutation = useCreateAdminPlatform();
  const updateMutation = useUpdateAdminPlatform();
  const deleteMutation = useDeleteAdminPlatform();
  const publishMutation = usePublishPlatform();

  const platforms = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;

  const createForm = useForm<PlatformFormValues>({
    resolver: zodResolver(platformSchema),
    defaultValues: { name: "", url: "" },
  });

  const editForm = useForm<PlatformFormValues>({
    resolver: zodResolver(platformSchema),
    defaultValues: { name: "", url: "" },
  });

  const openEdit = (platform: AdminPlatformRow) => {
    setEditTarget(platform);
    editForm.reset({ name: platform.name, url: platform.url ?? "" });
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
            Platforms
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage the platforms users pick for their applications
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Platform
        </Button>
      </motion.div>

      <CatalogTable
        kind="platform"
        rows={platforms}
        total={data?.total ?? 0}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        search={search}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        visibility={visibility}
        onVisibilityChange={(next) => {
          setVisibility(next);
          setPage(1);
        }}
        isLoading={isLoading && !data}
        isFetching={isFetching}
        isError={isError}
        onRetry={() => void refetch()}
        onEdit={openEdit}
        onDelete={(row) => deleteMutation.mutateAsync(row.id)}
        isDeleting={deleteMutation.isPending}
        onApprove={async (row) => {
          try {
            await publishMutation.mutateAsync(row.id);
          } catch (error) {
            return safeErrorMessage(error, "Could not approve it. Try again.");
          }
        }}
      />

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
              <Label htmlFor="create-platform-name">Name</Label>
              <Input
                id="create-platform-name"
                {...createForm.register("name")}
                className={cn(
                  createForm.formState.errors.name &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-platform-url">URL (optional)</Label>
              <Input
                id="create-platform-url"
                {...createForm.register("url")}
                placeholder="https://..."
                className={cn(
                  createForm.formState.errors.url &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {createForm.formState.errors.url && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.url.message}
                </p>
              )}
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
              <Label htmlFor="edit-platform-name">Name</Label>
              <Input
                id="edit-platform-name"
                {...editForm.register("name")}
                className={cn(
                  editForm.formState.errors.name &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {editForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-platform-url">URL (optional)</Label>
              <Input
                id="edit-platform-url"
                {...editForm.register("url")}
                className={cn(
                  editForm.formState.errors.url &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {editForm.formState.errors.url && (
                <p className="text-xs text-destructive">
                  {editForm.formState.errors.url.message}
                </p>
              )}
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
    </div>
  );
}
