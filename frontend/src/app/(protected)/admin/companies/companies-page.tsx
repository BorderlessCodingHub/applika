"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  useAdminCompanies,
  useCreateAdminCompany,
  useUpdateAdminCompany,
  useDeleteAdminCompany,
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
import type { AdminCompanyRow } from "@/services/types/admin";

const PAGE_SIZE = 15;

const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  url: z.string().url("Must be a valid URL"),
});
type CompanyFormValues = z.infer<typeof companySchema>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCompanyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCompanyRow | null>(
    null,
  );

  const { data, isLoading, isFetching } = useAdminCompanies({
    search: search || undefined,
    page: page + 1,
    per_page: PAGE_SIZE,
  });

  const createCompany = useCreateAdminCompany();
  const updateCompany = useUpdateAdminCompany();
  const deleteCompany = useDeleteAdminCompany();

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
        className="flex items-start justify-between"
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

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 p-5 pb-3 sm:flex-row sm:items-center">
          <span className="text-xs tabular-nums text-muted-foreground/60">
            {data?.total ?? 0} companies
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search companies..."
              className="h-8 w-full pl-8 sm:w-64"
            />
          </div>
        </div>

        {isLoading && !data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className={cn("overflow-x-auto transition-opacity duration-200", isFetching && "opacity-50")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/40 bg-accent/20">
                    <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      Company
                    </th>
                    <th className="hidden px-3 py-2.5 text-left md:table-cell font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      URL
                    </th>
                    <th className="px-3 py-2.5 text-center font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      Apps
                    </th>
                    <th className="hidden px-3 py-2.5 text-right lg:table-cell font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      Created
                    </th>
                    <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company, i) => (
                    <motion.tr
                      key={company.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.02 }}
                      className="border-b border-border/20 transition-colors hover:bg-accent/30"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <span className="font-display font-medium text-foreground">
                            {company.name}
                          </span>
                          {company.created_by_username && (
                            <p className="text-[11px] text-muted-foreground/70">
                              by {company.created_by_username}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <a
                          href={company.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <span className="max-w-[200px] truncate">
                            {company.url}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            company.is_active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/30 bg-rose-500/10 text-rose-400",
                          )}
                        >
                          {company.is_active ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right font-display tabular-nums text-foreground">
                        {company.applications_count}
                      </td>
                      <td className="hidden px-3 py-3 text-right text-xs text-muted-foreground lg:table-cell">
                        {formatDate(company.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(company)}
                            title="Edit company details"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateCompany.mutate({
                                id: company.id,
                                data: { is_active: !company.is_active },
                              })
                            }
                            title="Toggle company status"
                          >
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                company.is_active
                                  ? "bg-emerald-400"
                                  : "bg-rose-400",
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(company)}
                            disabled={company.applications_count > 0}
                            title={
                              company.applications_count > 0
                                ? "Cannot delete: has linked applications"
                                : "Delete company"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/30 px-5 py-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

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

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete company</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteCompany.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
              disabled={deleteCompany.isPending}
            >
              {deleteCompany.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
