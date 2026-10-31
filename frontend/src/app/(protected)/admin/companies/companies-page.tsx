"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import {
  useAdminCompanies,
  useCreateAdminCompany,
  useUpdateAdminCompany,
  useDeleteAdminCompany,
  usePublishCompany,
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
import type { AdminCompanyRow } from "@/services/types/admin";

const PAGE_SIZE = 15;

const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  url: z.string().url("Must be a valid URL"),
});
type CompanyFormValues = z.infer<typeof companySchema>;

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<CatalogVisibility>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCompanyRow | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useAdminCompanies({
    search: search || undefined,
    visibility: visibilityParam(visibility),
    page,
    per_page: PAGE_SIZE,
  });

  const createCompany = useCreateAdminCompany();
  const updateCompany = useUpdateAdminCompany();
  const deleteCompany = useDeleteAdminCompany();
  const publishCompany = usePublishCompany();

  const companies = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;

  const createForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", url: "" },
  });

  const editForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: "", url: "" },
  });

  const handleCreate = (values: CompanyFormValues) => {
    createCompany.mutate(values, {
      onSuccess: () => {
        setCreateOpen(false);
        createForm.reset();
      },
    });
  };

  const handleEdit = (values: CompanyFormValues) => {
    if (!editTarget) return;
    updateCompany.mutate(
      { id: editTarget.id, data: values },
      {
        onSuccess: () => {
          setEditTarget(null);
          editForm.reset();
        },
      },
    );
  };

  const openEdit = (company: AdminCompanyRow) => {
    setEditTarget(company);
    editForm.reset({ name: company.name, url: company.url });
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
            Company Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage companies available on the platform
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Company
        </Button>
      </motion.div>

      <CatalogTable
        kind="company"
        rows={companies}
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
        onDelete={(row) => deleteCompany.mutateAsync(row.id)}
        isDeleting={deleteCompany.isPending}
        onApprove={async (row) => {
          try {
            await publishCompany.mutateAsync(row.id);
          } catch (error) {
            return safeErrorMessage(error, "Could not approve it. Try again.");
          }
        }}
        onToggleActive={(row) =>
          updateCompany.mutate({
            id: row.id,
            data: { is_active: !row.is_active },
          })
        }
      />

      {/* Create Company Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit(handleCreate)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
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
              <Label htmlFor="create-url">URL</Label>
              <Input
                id="create-url"
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
              <Button type="submit" disabled={createCompany.isPending}>
                {createCompany.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
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
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
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
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
