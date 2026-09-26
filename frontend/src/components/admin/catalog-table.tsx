"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";

import { safeErrorMessage } from "@/components/application-drafts/draft-copy";
import {
  AddedBy,
  VisibilityFilter,
  type CatalogVisibility,
} from "@/components/admin/catalog-visibility";
import { ApproveCatalogButton } from "@/components/admin/approve-catalog-button";
import { OnlyYouBadge } from "@/components/applications/only-you-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdminCatalogCreatedBy } from "@/services/types/admin";

/** The fields a company or a platform row shares. */
export interface CatalogRow {
  id: string;
  name: string;
  url: string | null;
  is_public: boolean;
  applications_count: number;
  created_at: string;
  created_by?: AdminCatalogCreatedBy | null;
  /** Companies only. */
  is_active?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface CatalogTableProps<T extends CatalogRow> {
  kind: "company" | "platform";
  rows: readonly T[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (search: string) => void;
  visibility: CatalogVisibility;
  onVisibilityChange: (visibility: CatalogVisibility) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onEdit: (row: T) => void;
  /** Resolves once the row is gone. Rejects to show the server's `detail`. */
  onDelete: (row: T) => Promise<void>;
  isDeleting?: boolean;
  /** `POST /admin/{companies|platforms}/{id}/publish`. */
  onApprove: (row: T) => Promise<string | void>;
  /** Present only for companies — renders a Status column and toggle. */
  onToggleActive?: (row: T) => void;
}

/**
 * The shared companies/platforms admin table (PRD 0010, KODI-035): search,
 * visibility filter, paging, Added by, Apps and Approve on private rows.
 * `kind="company"` additionally renders the Status column when
 * `onToggleActive` is given.
 */
export function CatalogTable<T extends CatalogRow>({
  kind,
  rows,
  total,
  page,
  totalPages,
  onPageChange,
  search,
  onSearchChange,
  visibility,
  onVisibilityChange,
  isLoading,
  isFetching,
  isError,
  onRetry,
  onEdit,
  onDelete,
  isDeleting,
  onApprove,
  onToggleActive,
}: CatalogTableProps<T>) {
  const prefersReducedMotion = useReducedMotion();
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const plural = kind === "company" ? "companies" : "platforms";
  const singular = kind === "company" ? "company" : "platform";
  const label = kind === "company" ? "Company" : "Platform";
  const countLabel = `${total} ${total === 1 ? singular : plural}`;

  const focusVisibilityFilter = () => {
    document
      .querySelector<HTMLElement>('[data-slot="visibility-filter"]')
      ?.focus();
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await onDelete(deleteTarget);
      closeDelete();
      focusVisibilityFilter();
    } catch (error) {
      setDeleteError(
        safeErrorMessage(error, `Could not delete this ${singular}.`),
      );
    }
  };

  const emptyMessage =
    search || visibility !== "all"
      ? `No ${plural} match your search.`
      : `No ${plural} yet.`;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 p-5 pb-3 sm:flex-row sm:items-center">
          <span className="font-numeric text-xs text-muted-foreground">
            {countLabel}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityFilter
              value={visibility}
              onValueChange={onVisibilityChange}
            />
            <div className="relative">
              <Search
                aria-hidden
                className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50"
              />
              <Input
                type="search"
                aria-label={`Search ${plural}`}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Search ${plural}...`}
                className="h-8 w-full pl-8 sm:w-64"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 px-5 py-10 text-center text-sm text-muted-foreground"
          >
            <p>Could not load {plural}.</p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "overflow-x-auto transition-opacity duration-200",
                isFetching && "opacity-50",
              )}
              aria-busy={isFetching}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/40 bg-accent/20">
                    <th className="px-5 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                      {label}
                    </th>
                    <th className="hidden px-3 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase md:table-cell">
                      URL
                    </th>
                    {onToggleActive ? (
                      <th className="px-3 py-2.5 text-center font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                        Status
                      </th>
                    ) : null}
                    <th className="hidden px-3 py-2.5 text-left font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase md:table-cell">
                      Added by
                    </th>
                    <th className="px-3 py-2.5 text-right font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                      Apps
                    </th>
                    <th className="hidden px-3 py-2.5 text-right font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase lg:table-cell">
                      Created
                    </th>
                    <th className="px-5 py-2.5 text-right font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={onToggleActive ? 6 : 5}
                        className="px-5 py-10 text-center text-sm text-muted-foreground"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, i) => (
                      <motion.tr
                        key={row.id}
                        initial={
                          prefersReducedMotion
                            ? undefined
                            : { opacity: 0, x: -8 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.02 }}
                        className="border-b border-border/20 transition-colors hover:bg-accent/30"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-medium text-foreground">
                              {row.name}
                            </span>
                            {!row.is_public ? (
                              <OnlyYouBadge label="Private" />
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <span className="max-w-[200px] truncate">
                                {row.url}
                              </span>
                              <ExternalLink aria-hidden className="h-3 w-3" />
                              <span className="sr-only">
                                (opens in a new tab)
                              </span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground">
                              <span aria-hidden>—</span>
                              <span className="sr-only">No URL</span>
                            </span>
                          )}
                        </td>
                        {onToggleActive ? (
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  row.is_active
                                    ? "border-success/30 bg-success/10 text-success"
                                    : "text-muted-foreground",
                                )}
                              >
                                {row.is_active ? "active" : "inactive"}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => onToggleActive(row)}
                                title="Toggle status"
                                aria-label={`Toggle status for ${row.name}`}
                                className="rounded-full"
                              >
                                <span
                                  className={cn(
                                    "block h-2.5 w-2.5 rounded-full",
                                    row.is_active
                                      ? "bg-success"
                                      : "bg-destructive",
                                  )}
                                />
                              </button>
                            </div>
                          </td>
                        ) : null}
                        <td className="hidden px-3 py-3 md:table-cell">
                          <AddedBy username={row.created_by?.username} />
                        </td>
                        <td className="px-3 py-3 text-right font-numeric text-foreground">
                          {row.applications_count}
                        </td>
                        <td className="hidden px-3 py-3 text-right text-xs text-muted-foreground lg:table-cell">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!row.is_public ? (
                              <ApproveCatalogButton
                                kind={kind}
                                name={row.name}
                                url={row.url}
                                addedBy={row.created_by?.username}
                                onApprove={() => onApprove(row)}
                                onApproved={focusVisibilityFilter}
                              />
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Edit ${row.name}`}
                              onClick={() => onEdit(row)}
                            >
                              <Pencil aria-hidden className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              aria-label={`Delete ${row.name}`}
                              onClick={() => setDeleteTarget(row)}
                              disabled={row.applications_count > 0}
                              title={
                                row.applications_count > 0
                                  ? "Cannot delete: used by applications"
                                  : `Delete ${singular}`
                              }
                            >
                              <Trash2 aria-hidden className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav
                aria-label={`${label} pages`}
                className="flex items-center justify-between border-t border-border/30 px-5 py-3"
              >
                <span
                  aria-live="polite"
                  className="font-numeric text-xs text-muted-foreground"
                >
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Previous page"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Next page"
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              </nav>
            ) : null}
          </>
        )}
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && closeDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p
              role="alert"
              data-slot="catalog-delete-error"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-pretty text-foreground"
            >
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
