"use client";

import { useId, useState } from "react";
import { ChevronRight, Search, Shield, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useAdminNumber,
  useAdminRelative,
  useAvailabilityLabel,
  useSeniorityLabel,
} from "@/components/admin/admin-format";
import { PhoneChip } from "@/components/phone/phone-chip";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePager } from "@/components/phone/phone-pager";
import { PhonePill } from "@/components/phone/phone-pill";
import {
  PhoneSheetClose,
  PhoneSheetFrame,
  PhoneSheetTitle,
} from "@/components/phone/phone-sheet";
import { initials } from "@/lib/phone-format";
import type {
  AdminUserDetail,
  AdminUserRow,
  PaginatedResponse,
} from "@/services/types/admin";

/** The five sort chips v3/AdminUsers draws, in its order (the API's `sort_by`). */
export type AdminUserSortKey =
  | "joined_at"
  | "username"
  | "total_applications"
  | "offers"
  | "denials";

export const ADMIN_USER_SORTS: readonly {
  key: AdminUserSortKey;
  /** `admin.users.columns.*`. */
  label: "joined" | "user" | "apps" | "offers" | "denials";
}[] = [
  { key: "joined_at", label: "joined" },
  { key: "username", label: "user" },
  { key: "total_applications", label: "apps" },
  { key: "offers", label: "offers" },
  { key: "denials", label: "denials" },
];

export interface AdminUsersScreenViewProps {
  search: string;
  /** Today's search: the page goes back to the first page. */
  onSearchChange: (search: string) => void;
  /** The current `sort_by`; one the chips do not draw (`last_activity`) presses none. */
  sortKey: string;
  sortDir: "asc" | "desc";
  /** Today's `handleSort`: a new key sorts descending, the current one flips; first page. */
  onSort: (key: AdminUserSortKey) => void;
  /** `useAdminUsers({search, sort_by, sort_order, page, per_page: 15})` as a section load. */
  users: PhoneLoad<PaginatedResponse<AdminUserRow>>;
  /** A search, sort or page is loading over the rows on screen. */
  refreshing?: boolean;
  /** 1-based (the page keeps 0-based state: pass `page + 1`). */
  page: number;
  /** 1-based. */
  onPageChange: (page: number) => void;
  /** `useUpdateAdminUser` with `{is_admin: !user.is_admin}`. */
  onToggleAdmin: (user: AdminUserRow) => void;
  /** The user whose administrator flag is being saved. */
  pendingAdminId?: string | null;
  /** The user whose details are open (today's `selectedUser`); `null` closes the sheet. */
  selected: AdminUserRow | null;
  onSelectedChange: (user: AdminUserRow | null) => void;
  /** `useAdminUserDetail(selected.id)` as a section load. */
  detail: PhoneLoad<AdminUserDetail>;
}

/** v3/AdminUsers below md (under `AdminPhoneHeader`): props in, the board out. */
export function AdminUsersScreenView({
  search,
  onSearchChange,
  sortKey,
  sortDir,
  onSort,
  users,
  refreshing = false,
  page,
  onPageChange,
  onToggleAdmin,
  pendingAdminId = null,
  selected,
  onSelectedChange,
  detail,
}: AdminUsersScreenViewProps) {
  const t = useTranslations("phone.adminUsers");
  const tUsers = useTranslations("admin.users");
  const tColumns = useTranslations("admin.users.columns");
  const n = useAdminNumber();
  const searchId = useId();
  const data = users.status === "ready" ? users.data : null;

  return (
    <div data-slot="phone-admin-users" className="ph-app ph-ad-body ph-ad-list">
      <div className="ph-au-search">
        <label htmlFor={searchId} className="ph-sr">
          {t("searchLabel")}
        </label>
        <Search size={18} aria-hidden="true" className="ph-au-search-ic" />
        <input
          id={searchId}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={tUsers("searchPlaceholder")}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="ph-input ph-au-search-input"
        />
      </div>

      <div className="ph-au-bar">
        <span data-slot="user-count" className="ph-mono ph-au-count">
          {data
            ? tUsers("count", { count: data.total, total: n(data.total) })
            : null}
        </span>
        <span className="ph-au-sort-by">{t("sortBy")}</span>
      </div>

      <div
        role="group"
        aria-label={t("sortGroup")}
        data-slot="user-sort"
        className="ph-hs ph-au-sort"
      >
        {ADMIN_USER_SORTS.map(({ key, label }) => {
          const on = sortKey === key;
          const word = tColumns(label);
          return (
            <PhoneChip
              key={key}
              pressed={on}
              aria-label={t("sortChip", {
                label: word,
                dir: on ? sortDir : "none",
              })}
              data-sort={key}
              onClick={() => onSort(key)}
            >
              {word}
              {/* The board keeps the empty arrow on every chip (its 6px gap). */}
              <span aria-hidden="true" className="ph-mono ph-au-arrow">
                {on ? t("arrow", { dir: sortDir }) : null}
              </span>
            </PhoneChip>
          );
        })}
      </div>

      <PhoneLoadable
        state={users}
        loading={
          <PhoneSkeleton label={t("loading")}>
            <PhoneSkeletonCard className="h-[324px]" />
          </PhoneSkeleton>
        }
      >
        {(list) =>
          list.items.length === 0 ? (
            <p
              data-slot="users-empty"
              data-reason={search.trim() ? "no-match" : "empty"}
              className="ph-card ph-hint"
            >
              {search.trim() ? t("noMatch") : t("empty")}
            </p>
          ) : (
            <ul
              data-slot="admin-users"
              data-refreshing={refreshing || undefined}
              aria-busy={refreshing || undefined}
              className="ph-group ph-au-list"
            >
              {list.items.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  pending={pendingAdminId === user.id}
                  onToggleAdmin={() => onToggleAdmin(user)}
                  onOpen={() => onSelectedChange(user)}
                />
              ))}
            </ul>
          )
        }
      </PhoneLoadable>

      {data ? (
        <PhonePager
          page={page}
          totalPages={data.total_pages}
          onPageChange={onPageChange}
        />
      ) : null}

      <UserDetailsSheet
        selected={selected}
        onSelectedChange={onSelectedChange}
        detail={detail}
      />
    </div>
  );
}

function UserRow({
  user,
  pending,
  onToggleAdmin,
  onOpen,
}: {
  user: AdminUserRow;
  pending: boolean;
  onToggleAdmin: () => void;
  onOpen: () => void;
}) {
  const t = useTranslations("phone.adminUsers");
  const tUsers = useTranslations("admin.users");
  const n = useAdminNumber();
  const joined = useAdminRelative();
  const seniority = useSeniorityLabel();

  return (
    <li
      data-slot="admin-user-row"
      data-user-id={user.id}
      data-admin={user.is_admin || undefined}
      className="ph-au-row"
    >
      <div className="ph-au-head">
        <span aria-hidden="true" className="ph-au-ini">
          {initials(user)}
        </span>
        <div className="ph-au-who">
          <div className="ph-au-name-row">
            <span className="ph-au-name">{user.username}</span>
            {user.is_admin ? (
              <PhonePill tone="pri">{tUsers("adminBadge")}</PhonePill>
            ) : null}
          </div>
          <div className="ph-au-email">{user.email}</div>
        </div>
        <time dateTime={user.joined_at} className="ph-au-joined">
          {joined(user.joined_at)}
        </time>
      </div>
      <div className="ph-au-foot">
        {user.seniority_level ? (
          <span className="ph-tag">{seniority(user.seniority_level)}</span>
        ) : null}
        <span className="ph-mono ph-au-counts">
          {t("counts", {
            apps: n(user.total_applications),
            offers: n(user.offers),
            denials: n(user.denials),
          })}
        </span>
        {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
        <button
          type="button"
          aria-label={tUsers("toggleAdmin")}
          aria-pressed={user.is_admin}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          data-disabled={pending || undefined}
          data-action="toggle-admin"
          className="ph-iconbtn ph-au-shield"
          onClick={() => {
            if (!pending) onToggleAdmin();
          }}
        >
          <Shield size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={tUsers("viewDetails")}
          aria-haspopup="dialog"
          data-action="view-user"
          className="ph-iconbtn"
          onClick={onOpen}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** The details sheet; it keeps the last user on screen while it slides away. */
function UserDetailsSheet({
  selected,
  onSelectedChange,
  detail,
}: {
  selected: AdminUserRow | null;
  onSelectedChange: (user: AdminUserRow | null) => void;
  detail: PhoneLoad<AdminUserDetail>;
}) {
  const t = useTranslations("phone.adminUsers");
  const tCommon = useTranslations("common");
  const [last, setLast] = useState({ user: selected, detail });
  if (selected !== null && (selected !== last.user || detail !== last.detail)) {
    setLast({ user: selected, detail });
  }
  const user = selected ?? last.user;
  const shown = selected !== null ? detail : last.detail;

  return (
    <PhoneSheetFrame
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onSelectedChange(null);
      }}
    >
      <span className="ph-grab" aria-hidden="true" />
      <div className="ph-au-sheet-head">
        <PhoneSheetTitle className="ph-h2 ph-au-sheet-h">
          {user?.username}
        </PhoneSheetTitle>
        <PhoneSheetClose
          aria-label={tCommon("close")}
          className="ph-iconbtn ph-flat"
        >
          <X size={18} aria-hidden="true" />
        </PhoneSheetClose>
      </div>
      <PhoneLoadable
        state={shown}
        className="ph-scroll ph-au-sheet-body"
        loading={
          <PhoneSkeleton label={t("detailLoading")}>
            <PhoneSkeletonCard className="h-[64px] rounded-[14px]" />
            <PhoneSkeletonCard className="h-[64px] rounded-[14px]" />
            <PhoneSkeletonCard className="h-[64px] rounded-[14px]" />
          </PhoneSkeleton>
        }
      >
        {(details) => <UserDetails details={details} />}
      </PhoneLoadable>
    </PhoneSheetFrame>
  );
}

/** A detail's words, or `null` when it is empty (the sheet omits the row). */
const filled = (value: string | null | undefined) => value?.trim() || null;

function UserDetails({ details }: { details: AdminUserDetail }) {
  const td = useTranslations("admin.users.detail");
  const n = useAdminNumber();
  const seniority = useSeniorityLabel();
  const availability = useAvailabilityLabel();
  const statsId = useId();
  const bioId = useId();
  const stackId = useId();
  const name = [details.first_name, details.last_name]
    .map(filled)
    .filter(Boolean)
    .join(" ");
  const role = filled(details.current_role);
  const company = filled(details.current_company);
  const level = filled(details.seniority_level);
  const location = filled(details.location);
  const open = filled(details.availability);
  const bio = filled(details.bio);
  const stack = (details.tech_stack ?? []).filter((item) => filled(item));

  return (
    <>
      <dl data-slot="user-detail-facts" className="ph-dl ph-dl-bg ph-au-dl">
        <div className="ph-au-span">
          <dt>{td("email")}</dt>
          <dd>{details.email}</dd>
        </div>
        <div>
          <dt>{td("githubId")}</dt>
          <dd className="ph-mono">{details.github_id ?? "—"}</dd>
        </div>
        {name ? (
          <div>
            <dt>{td("name")}</dt>
            <dd>{name}</dd>
          </div>
        ) : null}
        {role ? (
          <div>
            <dt>{td("role")}</dt>
            <dd>{role}</dd>
          </div>
        ) : null}
        {company ? (
          <div>
            <dt>{td("company")}</dt>
            <dd>{company}</dd>
          </div>
        ) : null}
        {level ? (
          <div>
            <dt>{td("seniority")}</dt>
            <dd>
              <span className="ph-tag">{seniority(level)}</span>
            </dd>
          </div>
        ) : null}
        {location ? (
          <div>
            <dt>{td("location")}</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
        {open ? (
          <div className="ph-au-span">
            <dt>{td("availability")}</dt>
            <dd>{availability(open)}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby={statsId}>
        <h3 id={statsId} className="ph-gh">
          {td("stats")}
        </h3>
        <dl
          data-slot="user-detail-stats"
          className="ph-dl ph-dl-bg ph-dl-4 ph-au-dl"
        >
          <div>
            <dt>{td("total")}</dt>
            <dd className="ph-mono">{n(details.total_applications)}</dd>
          </div>
          <div>
            <dt>{td("offers")}</dt>
            <dd className="ph-mono">{n(details.offers)}</dd>
          </div>
          <div>
            <dt>{td("denials")}</dt>
            <dd className="ph-mono">{n(details.denials)}</dd>
          </div>
          <div>
            <dt>{td("active")}</dt>
            <dd className="ph-mono">{n(details.active_applications)}</dd>
          </div>
        </dl>
      </section>

      {bio ? (
        <section aria-labelledby={bioId}>
          <h3 id={bioId} className="ph-gh">
            {td("bio")}
          </h3>
          <p className="ph-au-bio">{bio}</p>
        </section>
      ) : null}

      {stack.length > 0 ? (
        <section aria-labelledby={stackId}>
          <h3 id={stackId} className="ph-gh">
            {td("techStack")}
          </h3>
          <div className="ph-au-stack">
            {stack.map((item) => (
              <span key={item} className="ph-tag">
                {item}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
