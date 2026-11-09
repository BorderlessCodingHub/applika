"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { AxiosError } from "axios";
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
import { APPROVE_COPY } from "@/components/admin/approve-catalog-button";
import { word } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import { getApiError } from "@/lib/api-client";
import { fromQuery } from "@/components/phone/phone-query-load";
import { CatalogScreenView } from "@/components/phone/screens/admin-catalog-screen";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useTranslations } from "next-intl";
import type { AdminCompanyRow } from "@/services/types/admin";

const PAGE_SIZE = 15;

const companySchema = z.object({
  name: z.string().min(1, {
    error: () => word("admin.catalog.form.nameRequired"),
  }),
  url: z.string().url({ error: () => word("admin.catalog.form.urlInvalid") }),
});
type CompanyFormValues = z.infer<typeof companySchema>;

export function CompaniesPage() {
  const t = useTranslations("admin.catalog.company");
  const tf = useTranslations("admin.catalog.form");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [visibility, setVisibility] = useState<CatalogVisibility>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCompanyRow | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useAdminCompanies({
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
  const isPhone = useIsPhone();

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

  // Below md v3/AdminCompanies (PRD 0022): the same query, forms, schema and
  // mutations; Add, Edit, Approve and Delete open sheets that show the
  // server's refusal inside them.
  if (isPhone) {
    // The switch and Edit share the update: tell a status change from a save.
    const statusChange = updateCompany.variables?.data.is_active !== undefined;
    return (
      <CatalogScreenView
        kind="company"
        rows={fromQuery({ data, isError, error, isFetching, refetch })}
        refreshing={isFetching && !!data}
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
        page={page}
        onPageChange={setPage}
        onAdd={() => {
          createCompany.reset();
          setCreateOpen(true);
        }}
        onEdit={(row) => {
          // A status change still in flight keeps its pending switch; its
          // error never reaches the sheet (`statusChange`).
          if (!updateCompany.isPending) updateCompany.reset();
          openEdit(row);
        }}
        onDelete={(row) => deleteCompany.mutateAsync(row.id)}
        onApprove={async (row) => {
          try {
            await publishCompany.mutateAsync(row.id);
          } catch (error) {
            return safeErrorMessage(error, APPROVE_COPY.failed);
          }
        }}
        onToggleActive={(row) =>
          updateCompany.mutate({
            id: row.id,
            data: { is_active: !row.is_active },
          })
        }
        togglingId={
          updateCompany.isPending && statusChange
            ? (updateCompany.variables?.id ?? null)
            : null
        }
        add={{
          open: createOpen,
          onOpenChange: setCreateOpen,
          form: createForm,
          onSubmit: handleCreate,
          pending: createCompany.isPending,
          error: createCompany.error
            ? getApiError(createCompany.error as AxiosError)
            : null,
        }}
        edit={{
          open: !!editTarget,
          onOpenChange: (open) => {
            if (!open) setEditTarget(null);
          },
          form: editForm,
          onSubmit: handleEdit,
          pending: updateCompany.isPending && !statusChange,
          error:
            updateCompany.error && !statusChange
              ? getApiError(updateCompany.error as AxiosError)
              : null,
        }}
      />
    );
  }

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
            return safeErrorMessage(error, APPROVE_COPY.failed);
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
            <DialogTitle>{t("add")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit(handleCreate)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="create-name">{tf("name")}</Label>
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
              <Label htmlFor="create-url">{tf("url")}</Label>
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
                {tf("cancel")}
              </Button>
              <Button type="submit" disabled={createCompany.isPending}>
                {createCompany.isPending ? tf("creating") : tf("create")}
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
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">{tf("name")}</Label>
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
              <Label htmlFor="edit-url">{tf("url")}</Label>
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
                {tf("cancel")}
              </Button>
              <Button type="submit" disabled={updateCompany.isPending}>
                {updateCompany.isPending ? tf("saving") : tf("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
