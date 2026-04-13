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
        "flex items-center gap-1 font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground transition-colors hover:text-foreground",
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

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function UsersPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("joined_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

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
          User Management
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          View, search, and manage all platform users
        </p>
      </motion.div>

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 p-5 pb-3 sm:flex-row sm:items-center">
          <span className="text-xs tabular-nums text-muted-foreground/60">
            {data?.total ?? 0} users
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search users..."
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
                    <th className="px-5 py-2.5 text-left">
                      <SortHeader
                        label="User"
                        sortKey="username"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                      <span className="font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                        Seniority
                      </span>
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader
                        label="Apps"
                        sortKey="total_applications"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-right md:table-cell">
                      <SortHeader
                        label="Offers"
                        sortKey="offers"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="hidden px-3 py-2.5 text-right md:table-cell">
                      <SortHeader
                        label="Denials"
                        sortKey="denials"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader
                        label="Joined"
                        sortKey="joined_at"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                    <th className="px-5 py-2.5 text-right">
                      <span className="font-display text-[11px] font-semibold uppercase tracking-wide-label text-muted-foreground">
                        Actions
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
                                  admin
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
                            {user.seniority_level.replace("_", " ")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-display font-semibold tabular-nums text-foreground">
                        {user.total_applications}
                      </td>
                      <td className="hidden px-3 py-3 text-right font-display tabular-nums text-primary md:table-cell">
                        {user.offers}
                      </td>
                      <td className="hidden px-3 py-3 text-right font-display tabular-nums text-rose-400 md:table-cell">
                        {user.denials}
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        {formatRelative(user.joined_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedUser(user)}
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
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Email
                  </p>
                  <p className="font-medium">{userDetail.email}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    GitHub ID
                  </p>
                  <p className="font-medium">{userDetail.github_id}</p>
                </div>
                {userDetail.first_name && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Name
                    </p>
                    <p className="font-medium">
                      {userDetail.first_name} {userDetail.last_name}
                    </p>
                  </div>
                )}
                {userDetail.current_role && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Role
                    </p>
                    <p className="font-medium">{userDetail.current_role}</p>
                  </div>
                )}
                {userDetail.current_company && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Company
                    </p>
                    <p className="font-medium">{userDetail.current_company}</p>
                  </div>
                )}
                {userDetail.seniority_level && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Seniority
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border font-display text-[10px] font-medium capitalize",
                        SENIORITY_COLORS[userDetail.seniority_level] ??
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {userDetail.seniority_level.replace("_", " ")}
                    </Badge>
                  </div>
                )}
                {userDetail.location && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Location
                    </p>
                    <p className="font-medium">{userDetail.location}</p>
                  </div>
                )}
                {userDetail.availability && (
                  <div>
                    <p className="text-[11px] uppercase text-muted-foreground">
                      Availability
                    </p>
                    <p className="font-medium capitalize">
                      {userDetail.availability.replace("_", " ")}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/40 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">
                  Application Stats
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold tabular-nums">
                      {userDetail.total_applications}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-primary">
                      {userDetail.offers}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Offers</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-rose-400">
                      {userDetail.denials}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Denials
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-amber-400">
                      {userDetail.active_applications}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Active</p>
                  </div>
                </div>
              </div>

              {userDetail.bio && (
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground">
                    Bio
                  </p>
                  <p className="mt-1 text-muted-foreground">{userDetail.bio}</p>
                </div>
              )}

              {userDetail.tech_stack && userDetail.tech_stack.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] uppercase text-muted-foreground">
                    Tech Stack
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {userDetail.tech_stack.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
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
