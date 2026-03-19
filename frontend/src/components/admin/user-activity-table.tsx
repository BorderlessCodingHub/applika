"use client";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAdminUsers } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";

type SortKey =
  | "username"
  | "total_applications"
  | "offers"
  | "denials"
  | "last_activity";
type SortDir = "asc" | "desc";

const SENIORITY_COLORS: Record<string, string> = {
  intern: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  junior: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  mid_level: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  senior: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  staff: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  lead: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  principal: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

const PAGE_SIZE = 8;

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
        className
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

export function UserActivityTable() {
  const { data: users, isLoading } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_applications");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    if (!users) return [];
    let result = users;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.location?.toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "last_activity") {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });

    return result;
  }, [users, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 p-5 pb-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-violet-400" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide-label text-muted-foreground">
              Users
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground/60">
              {filtered.length} total
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search users..."
              className="h-8 w-full rounded-lg border border-border/60 bg-accent/30 pl-8 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/50 sm:w-56"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
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
                    <th className="px-5 py-2.5 text-right">
                      <SortHeader
                        label="Last Active"
                        sortKey="last_activity"
                        current={sortKey}
                        dir={sortDir}
                        onSort={handleSort}
                        className="justify-end"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((user, i) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      className="border-b border-border/20 transition-colors hover:bg-accent/30"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <span className="font-display font-medium text-foreground">
                            {user.username}
                          </span>
                          <p className="max-w-[180px] truncate text-[11px] text-muted-foreground/70">
                            {user.location || user.email}
                          </p>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        {user.seniority_level && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "border font-display text-[10px] font-medium capitalize",
                              SENIORITY_COLORS[user.seniority_level] ||
                                "bg-muted text-muted-foreground"
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
                      <td className="px-5 py-3 text-right text-xs tabular-nums text-muted-foreground">
                        {formatRelative(user.last_activity)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
    </motion.div>
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
