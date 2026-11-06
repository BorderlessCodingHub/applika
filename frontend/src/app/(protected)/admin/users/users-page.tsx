"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  ShieldOff,
  User,
} from "lucide-react";
import {
  useAdminUsers,
  useUpdateAdminUser,
  useAdminUserDetail,
} from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { AdminUserRow } from "@/services/types/admin";
import {
  useAdminNumber,
  useAvailabilityLabel,
  useAdminPager,
  useAdminRelative,
  useSeniorityLabel,
} from "@/components/admin/admin-format";
import { useLocale, useTranslations } from "next-intl";

type SortKey =
  | "username"
  | "total_applications"
  | "offers"
  | "denials"
  | "last_activity"
  | "joined_at";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 15;

const SENIORITY_COLORS: Record<string, string> = {
  intern: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  junior: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  mid_level: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  senior: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  staff: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  lead: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  principal: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase transition-colors hover:text-foreground",
        className,
      )}
    >
      {label}
      {isActive ? (
        dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("joined_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const t = useTranslations("admin.users");
  const td = useTranslations("admin.users.detail");
  const availabilityLabel = useAvailabilityLabel();
  const locale = useLocale();
  const tc = useTranslations("admin.users.columns");
  const n = useAdminNumber();
  const pager = useAdminPager();
  const formatRelative = useAdminRelative();
  const seniorityLabel = useSeniorityLabel();

  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const { data, isLoading, isFetching } = useAdminUsers({
    search: search || undefined,
    sort_by: sortKey,
    sort_order: sortDir,
    page: page + 1,
    per_page: PAGE_SIZE,
  });

  const { data: userDetail } = useAdminUserDetail(selectedUser?.id ?? "");
  const updateUser = useUpdateAdminUser();

  const users = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
          {t("title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </motion.div>

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 p-5 pb-3 sm:flex-row sm:items-center">
          <span className="font-numeric text-xs text-muted-foreground/60">
            {t("count", {
              count: data?.total ?? 0,
              total: n(data?.total ?? 0),
            })}
          </span>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={t("searchPlaceholder")}
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
            <div
              className={cn(
                "overflow-x-auto transition-opacity duration-200",
                isFetching && "opacity-50",
              )}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/40 bg-accent/20">
                    <th className="px-5 py-2.5 text-left">
                      <SortHeader
                        label={tc("user")}
                        sortKey="username"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                      <span className="font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                        {tc("seniority")}
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader
                        label={tc("apps")}
                        sortKey="total_applications"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-right md:table-cell">
                      <SortHeader
                        label={tc("offers")}
                        sortKey="offers"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-right md:table-cell">
                      <SortHeader
                        label={tc("denials")}
                        sortKey="denials"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader
                        label={tc("joined")}
                        sortKey="joined_at"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="px-5 py-2.5 text-right">
                      <span className="font-display text-[11px] font-semibold tracking-wide-label text-muted-foreground uppercase">
                        {tc("actions")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.02 }}
                      className="border-b border-border/20 transition-colors hover:bg-accent/30"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-display font-medium text-foreground">
                                {user.username}
                              </span>
                              {user.is_admin && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400"
                                >
                                  {t("adminBadge")}
                                </Badge>
                              )}
                            </div>
                            <p className="max-w-[200px] truncate text-[11px] text-muted-foreground/70">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        {user.seniority_level && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "border font-display text-[10px] font-medium capitalize",
                              SENIORITY_COLORS[user.seniority_level] ??
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {seniorityLabel(user.seniority_level)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-numeric font-semibold text-foreground">
                        {n(user.total_applications)}
                      </td>
                      <td className="hidden px-3 py-3 text-right font-numeric text-primary md:table-cell">
                        {n(user.offers)}
                      </td>
                      <td className="hidden px-3 py-3 text-right font-numeric text-rose-400 md:table-cell">
                        {n(user.denials)}
                      </td>
                      <td className="px-3 py-3 text-right font-numeric text-xs text-muted-foreground">
                        {formatRelative(user.joined_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedUser(user)}
                            title={t("viewDetails")}
                            aria-label={t("viewDetails")}
                          >
                            <User className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateUser.mutate({
                                id: user.id,
                                data: { is_admin: !user.is_admin },
                              })
                            }
                            title={t("toggleAdmin")}
                            aria-label={t("toggleAdmin")}
                          >
                            {user.is_admin ? (
                              <ShieldOff className="h-3.5 w-3.5 text-amber-400" />
                            ) : (
                              <Shield className="h-3.5 w-3.5" />
                            )}
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
                <span className="font-numeric text-xs text-muted-foreground">
                  {pager.page(page + 1, totalPages)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    aria-label={pager.previous}
                    className="rounded-md p-1.5 transition-colors hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    aria-label={pager.next}
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

      {/* User Detail Sheet */}
      <Sheet
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedUser?.username}</SheetTitle>
          </SheetHeader>
          {userDetail && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">
                    {td("email")}
                  </p>
                  <p className="font-medium">{userDetail.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">
                    {td("githubId")}
                  </p>
                  <p className="font-medium">{userDetail.github_id ?? "—"}</p>
                </div>
                {userDetail.first_name && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("name")}
                    </p>
                    <p className="font-medium">
                      {userDetail.first_name} {userDetail.last_name}
                    </p>
                  </div>
                )}
                {userDetail.current_role && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("role")}
                    </p>
                    <p className="font-medium">{userDetail.current_role}</p>
                  </div>
                )}
                {userDetail.current_company && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("company")}
                    </p>
                    <p className="font-medium">{userDetail.current_company}</p>
                  </div>
                )}
                {userDetail.seniority_level && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("seniority")}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border font-display text-[10px] font-medium capitalize",
                        SENIORITY_COLORS[userDetail.seniority_level] ??
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {seniorityLabel(userDetail.seniority_level)}
                    </Badge>
                  </div>
                )}
                {userDetail.location && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("location")}
                    </p>
                    <p className="font-medium">{userDetail.location}</p>
                  </div>
                )}
                {userDetail.availability && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">
                      {td("availability")}
                    </p>
                    <p
                      className={cn(
                        "font-medium",
                        // pt-BR labels are sentence case already.
                        locale !== "pt-BR" && "capitalize",
                      )}
                    >
                      {availabilityLabel(userDetail.availability)}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/40 p-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground uppercase">
                  {td("stats")}
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="font-numeric text-lg font-bold">
                      {n(userDetail.total_applications)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {td("total")}
                    </p>
                  </div>
                  <div>
                    <p className="font-numeric text-lg font-bold text-primary">
                      {n(userDetail.offers)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {td("offers")}
                    </p>
                  </div>
                  <div>
                    <p className="font-numeric text-lg font-bold text-rose-400">
                      {n(userDetail.denials)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {td("denials")}
                    </p>
                  </div>
                  <div>
                    <p className="font-numeric text-lg font-bold text-amber-400">
                      {n(userDetail.active_applications)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {td("active")}
                    </p>
                  </div>
                </div>
              </div>

              {userDetail.bio && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">
                    {td("bio")}
                  </p>
                  <p className="mt-1 text-muted-foreground">{userDetail.bio}</p>
                </div>
              )}

              {userDetail.tech_stack && userDetail.tech_stack.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground uppercase">
                    {td("techStack")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {userDetail.tech_stack.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
