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
import { APPROVE_COPY } from "@/components/admin/approve-catalog-button";
import { word } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { AdminPlatformRow } from "@/services/types/admin";

const PAGE_SIZE = 15;
const NAME_MAX = 100;
const URL_MAX = 200;

const platformSchema = z.object({
  name: z
    .string()
    .min(1, { error: () => word("admin.catalog.form.nameRequired") })
    .max(NAME_MAX, {
      error: () =>
        word("admin.catalog.form.nameTooLong", { max: String(NAME_MAX) }),
    }),
  url: z
    .string()
    .max(URL_MAX, {
      error: () =>
        word("admin.catalog.form.urlTooLong", { max: String(URL_MAX) }),
    })
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
  const t = useTranslations("admin.catalog.platform");
  const tf = useTranslations("admin.catalog.form");
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
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("add")}
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
            return safeErrorMessage(error, APPROVE_COPY.failed);
          }
        }}
      />

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
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
              <Label htmlFor="create-platform-name">{tf("name")}</Label>
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
              <Label htmlFor="create-platform-url">{tf("urlOptional")}</Label>
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
                {tf("cancel")}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {tf("create")}
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
            <DialogTitle>{t("editTitle")}</DialogTitle>
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
              <Label htmlFor="edit-platform-name">{tf("name")}</Label>
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
              <Label htmlFor="edit-platform-url">{tf("urlOptional")}</Label>
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
                {tf("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {tf("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
