"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Award, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneField, PhoneInput } from "@/components/phone/phone-field";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill, type PhonePillTone } from "@/components/phone/phone-pill";
import { PhoneStat, PhoneStatGrid } from "@/components/phone/phone-stat-grid";
import { GithubRestoreNotice } from "@/components/profile/github-restore-notice";
import { UserProfileEditForm } from "@/components/profile/edit-form";
import {
  membershipAccess,
  membershipBadgeName,
} from "@/components/badges/membership-badge";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import { useAuth } from "@/contexts/auth-context";
import { useStartGithubRestore } from "@/hooks/use-github-restore";
import { useGeneralStats } from "@/hooks/use-statistics";
import { useDeleteAccount } from "@/hooks/use-user";
import { useIntlLocale } from "@/i18n/intl-locale";
import { displayName, initials } from "@/lib/phone-format";
import {
  PROFILE_BADGE_IDS,
  profileBadgeStates,
  type ProfileBadgeId,
  type ProfileBadgeState,
} from "@/lib/profile-badges";
import { formatProfileSalary } from "@/lib/profile-salary";
import { cn } from "@/lib/utils";
import { SelectOptions } from "@/options";
import type { GithubRestoreStatus } from "@/components/profile/github-restore-copy";
import type { AvailabilityType } from "@/services/types/users";

/** The two halves of v2/Profile and v2/Devices, one screen (`?tab=`). */
export type ProfileSection = "profile" | "devices";

export const PROFILE_SECTION_HREF: Readonly<Record<ProfileSection, string>> = {
  profile: "/profile",
  devices: "/profile?tab=devices",
};

export interface ProfileSectionsNavProps {
  current: ProfileSection;
  /**
   * A plain tap switches in place (the page `pushState`s `?tab=`); a new tab
   * or window follows the link. Absent, the links navigate.
   */
  onSelect?: (section: ProfileSection) => void;
  /** Focus the current link on mount when focus was lost (after a switch). */
  focusOnMount?: boolean;
}

/** The boards' segmented nav: two links, the current one `aria-current="page"`. */
export function ProfileSectionsNav({
  current,
  onSelect,
  focusOnMount = false,
}: ProfileSectionsNavProps) {
  const t = useTranslations("profile.tabs");
  const tPhone = useTranslations("phone.profile");
  const nav = useRef<HTMLElement>(null);

  // The other section's nav left with the tapped link: focus would drop to <body>.
  useEffect(() => {
    if (!focusOnMount) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    nav.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <nav
      ref={nav}
      aria-label={tPhone("sections")}
      data-slot="profile-sections"
      className="ph-seg ph-pf-seg"
    >
      {(["profile", "devices"] as const).map((section) => (
        <Link
          key={section}
          href={PROFILE_SECTION_HREF[section]}
          aria-current={section === current ? "page" : undefined}
          data-section={section}
          className={cn(section === current && "ph-on")}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (
              !onSelect ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            if (section !== current) onSelect(section);
          }}
        >
          <span className="max-w-full truncate">{t(section)}</span>
        </Link>
      ))}
    </nav>
  );
}

export { PROFILE_BADGE_IDS, type ProfileBadgeId };

export type ProfileBadge = ProfileBadgeState;

/** The Details cells; an absent value drops its cell, as today. */
export interface ProfileDetails {
  /** In words (`SelectOptions.SENIORITY`). */
  seniority?: string;
  experienceYears?: number;
  location?: string;
  /** Already written ("€58,000 / annually"), as the desktop writes it. */
  salary?: string;
  linkedinUrl?: string;
}

export interface ProfileAvailability {
  value: AvailabilityType;
  /** In words (`SelectOptions.AVAILABILITY`). */
  label: string;
}

export interface ProfileGithubRestore {
  onRestore: () => void;
  /** `isPending || isSuccess`: true until the browser leaves for GitHub. */
  pending: boolean;
}

export interface ProfileScreenViewProps {
  displayName: string;
  /** Already uppercased (`initials()`). */
  initials: string;
  role?: string;
  company?: string;
  /** One "Borderless BASE member" per held badge; empty when none is held. */
  membershipLabels: readonly string[];
  availability?: ProfileAvailability;
  bio?: string;
  details: ProfileDetails;
  techStack: readonly string[];
  /** From `useGeneralStats()`: the earned state needs the numbers. */
  badges: PhoneLoad<readonly ProfileBadge[]>;
  /** Given only while `user.github_restore.available`. */
  githubRestore?: ProfileGithubRestore;
  /** Today's `GithubRestoreNotice` after the GitHub round trip. */
  notice?: ReactNode;
  onEdit: () => void;
  /** Editing: today's edit form takes the profile's place and the bar's Edit goes. */
  editForm?: ReactNode;
  /** The delete phrase is "delete <username>". */
  username: string;
  onDeleteAccount: () => void;
  deletingAccount: boolean;
  /** See `ProfileSectionsNavProps`. */
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

const AVAILABILITY_TONE: Record<AvailabilityType, PhonePillTone | undefined> = {
  open_to_work: "ok",
  casually_looking: "warn",
  not_looking: undefined,
};

/** "linkedin.com/in/sam" for "https://www.linkedin.com/in/sam/". */
function linkText(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

/** v2/Profile below md: props in, the board out. */
export function ProfileScreenView({
  displayName,
  initials,
  role,
  company,
  membershipLabels,
  availability,
  bio,
  details,
  techStack,
  badges,
  githubRestore,
  notice,
  onEdit,
  editForm,
  username,
  onDeleteAccount,
  deletingAccount,
  onSelectSection,
  focusSections,
}: ProfileScreenViewProps) {
  const t = useTranslations("profile");
  const tPhone = useTranslations("phone.profile");
  const tGate = useTranslations("badges.gate");
  const detailsId = useId();
  const stackId = useId();
  const badgesId = useId();
  const editing = editForm !== undefined && editForm !== null;
  const editRoot = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);

  // Edit leaves with its button, and Save/Cancel with the form: focus would
  // drop to <body>, so it lands on the form, then back on Edit.
  useEffect(() => {
    if (editing === wasEditing.current) return;
    wasEditing.current = editing;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (editing ? editRoot.current : editButton.current)?.focus();
  }, [editing]);

  if (editing) {
    // Today's form keeps today's look: no `.ph-app` around it.
    return (
      <div
        ref={editRoot}
        tabIndex={-1}
        data-slot="phone-profile"
        data-editing=""
        className="ph-pf-edit"
      >
        <div className="ph-app">
          <ProfileSectionsNav
            current="profile"
            onSelect={onSelectSection}
            focusOnMount={focusSections}
          />
        </div>
        {editForm}
      </div>
    );
  }

  const roleLine =
    role && company
      ? tPhone("roleAt", { role, company })
      : (role ?? company ?? null);
  const pills = [
    ...membershipLabels.map((label) => (
      <PhonePill key={`member-${label}`} tone="pri">
        {label}
      </PhonePill>
    )),
    ...(availability
      ? [
          <PhonePill
            key="availability"
            tone={AVAILABILITY_TONE[availability.value]}
          >
            {availability.label}
          </PhonePill>,
        ]
      : []),
  ];
  const hasDetails =
    details.seniority !== undefined ||
    details.experienceYears !== undefined ||
    details.location !== undefined ||
    details.salary !== undefined ||
    details.linkedinUrl !== undefined;
  const earned =
    badges.status === "ready"
      ? badges.data.filter((badge) => badge.earned).length
      : null;

  return (
    <div data-slot="phone-profile" className="ph-app ph-pf">
      <PhoneTopBarEnd>
        <button
          ref={editButton}
          type="button"
          data-action="edit-profile"
          className="ph-btn ph-sm ph-sec"
          onClick={onEdit}
        >
          {t("edit")}
        </button>
      </PhoneTopBarEnd>

      <ProfileSectionsNav
        current="profile"
        onSelect={onSelectSection}
        focusOnMount={focusSections}
      />

      {notice}

      <div className="ph-pf-head">
        <span aria-hidden="true" className="ph-pf-avatar">
          {initials}
        </span>
        <div className="ph-pf-who">
          <h1 className="ph-pf-name">{displayName}</h1>
          {roleLine ? <p className="ph-pf-role">{roleLine}</p> : null}
          {pills.length > 0 ? <p className="ph-pf-pills">{pills}</p> : null}
        </div>
      </div>
      {bio ? <p className="ph-pf-bio">{bio}</p> : null}

      {hasDetails ? (
        <section aria-labelledby={detailsId}>
          <h2 id={detailsId} className="ph-gh">
            {t("details")}
          </h2>
          <PhoneStatGrid>
            {details.seniority !== undefined ? (
              <PhoneStat term={t("seniority")}>{details.seniority}</PhoneStat>
            ) : null}
            {details.experienceYears !== undefined ? (
              <PhoneStat term={t("experience")}>
                {t("experienceYears", { count: details.experienceYears })}
              </PhoneStat>
            ) : null}
            {details.location !== undefined ? (
              <PhoneStat term={t("location")}>
                <span className="ph-pf-wrap">{details.location}</span>
              </PhoneStat>
            ) : null}
            {details.salary !== undefined ? (
              <PhoneStat term={t("salary")} mono>
                {details.salary}
              </PhoneStat>
            ) : null}
            {details.linkedinUrl !== undefined ? (
              <PhoneStat term="LinkedIn" wide>
                <a
                  href={details.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ph-pf-link"
                >
                  {linkText(details.linkedinUrl)}
                  <span className="ph-sr">{tGate("opensInNewTab")}</span>
                </a>
              </PhoneStat>
            ) : null}
          </PhoneStatGrid>
        </section>
      ) : null}

      {techStack.length > 0 ? (
        <section aria-labelledby={stackId}>
          <h2 id={stackId} className="ph-gh">
            {t("techStack")}
          </h2>
          <ul className="ph-pf-tags">
            {techStack.map((tech) => (
              <li key={tech} className="ph-tag">
                {tech}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby={badgesId}>
        <div className="ph-pf-badges-head">
          <h2 id={badgesId} className="ph-gh">
            {t("badgesTitle")}
          </h2>
          {earned !== null && badges.status === "ready" ? (
            <span className="ph-mono ph-pf-count">
              {t("badgesEarned", {
                earned,
                total: badges.data.length,
              })}
            </span>
          ) : null}
        </div>
        <PhoneLoadable
          state={badges}
          loading={
            <PhoneSkeleton label={tPhone("loadingBadges")}>
              <div className="ph-badges">
                {PROFILE_BADGE_IDS.map((id) => (
                  <PhoneSkeletonCard
                    key={id}
                    className="h-[94px] rounded-2xl"
                  />
                ))}
              </div>
            </PhoneSkeleton>
          }
        >
          {(list) => (
            <ul data-slot="profile-badges" className="ph-badges">
              {list.map((badge) => {
                const description = t(`badgeDescription.${badge.id}`);
                return (
                  <li
                    key={badge.id}
                    data-badge={badge.id}
                    data-earned={badge.earned}
                    title={description}
                    className={cn("ph-badge", !badge.earned && "ph-off")}
                  >
                    <span className="ph-b" aria-hidden="true">
                      <Award size={18} />
                    </span>
                    <span className="ph-badge-name">
                      {t(`badge.${badge.id}`)}
                    </span>
                    <span className="ph-sr">
                      {badge.earned
                        ? tPhone("badgeEarned", { description })
                        : tPhone("badgeNotEarned", { description })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </PhoneLoadable>
      </section>

      {githubRestore ? <GithubRestoreCard {...githubRestore} /> : null}

      <DeleteAccountSection
        username={username}
        onDelete={onDeleteAccount}
        deleting={deletingAccount}
      />
    </div>
  );
}

function GithubRestoreCard({ onRestore, pending }: ProfileGithubRestore) {
  const t = useTranslations("profile.githubRestore");
  const headingId = useId();
  const bodyId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-slot="github-restore-card"
      data-pending={pending || undefined}
      className="ph-card ph-pf-card"
    >
      <h2 id={headingId} className="ph-pf-card-h">
        {t("cardTitle")}
      </h2>
      <p id={bodyId} className="ph-hint">
        {t("cardBody")}
      </p>
      <p className="ph-hint">{t("privacy")}</p>
      <button
        type="button"
        data-action="github-restore"
        aria-describedby={bodyId}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        data-disabled={pending || undefined}
        className="ph-btn ph-sm ph-sec"
        onClick={() => {
          if (!pending) onRestore();
        }}
      >
        {pending ? (
          <Loader2 size={16} aria-hidden="true" className="ph-spin" />
        ) : null}
        {t("cardAction")}
      </button>
    </section>
  );
}

/**
 * The board's delete section; "Delete your account" opens today's typed
 * confirmation in place (the phrase, Cancel, the final delete).
 */
function DeleteAccountSection({
  username,
  onDelete,
  deleting,
}: {
  username: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("profile.deleteAccount");
  const tPhone = useTranslations("phone.profile");
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const openButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Set by Cancel: the open button comes back and takes the focus Cancel had.
  const returning = useRef(false);

  useEffect(() => {
    if (open) {
      input.current?.focus();
    } else if (returning.current) {
      returning.current = false;
      openButton.current?.focus();
    }
  }, [open]);

  const phrase = t("phrase", { username });
  const confirmed = value === phrase;
  const locked = !confirmed || deleting;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="delete-account"
      data-open={open || undefined}
      className="ph-pf-delete"
    >
      <h2 id={headingId} className="ph-pf-card-h">
        {t("title")}
      </h2>
      <p className="ph-hint">{tPhone("deleteHint")}</p>
      {open ? (
        <div className="ph-pf-delete-panel">
          <p className="ph-pf-delete-warning">{t("warning")}</p>
          <ul className="ph-pf-delete-list">
            <li>{t("itemApplications")}</li>
            <li>{t("itemReports")}</li>
            <li>{t("itemProfile")}</li>
            <li>{t("itemCompanies")}</li>
          </ul>
          <PhoneField
            label={t.rich("confirmLabel", {
              phrase,
              b: (chunks) => <strong className="ph-pf-phrase">{chunks}</strong>,
            })}
          >
            <PhoneInput
              ref={input}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={phrase}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </PhoneField>
          <div className="ph-pf-actions">
            <button
              type="button"
              className="ph-btn ph-sm ph-sec"
              aria-disabled={deleting || undefined}
              data-disabled={deleting || undefined}
              onClick={() => {
                if (deleting) return;
                returning.current = true;
                setValue("");
                setOpen(false);
              }}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              data-action="delete-account"
              className="ph-btn ph-sm ph-dan"
              aria-disabled={locked || undefined}
              aria-busy={deleting || undefined}
              data-disabled={locked || undefined}
              onClick={() => {
                if (!locked) onDelete();
              }}
            >
              {deleting ? (
                <Loader2 size={16} aria-hidden="true" className="ph-spin" />
              ) : null}
              {deleting ? t("deleting") : t("confirm")}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={openButton}
          type="button"
          data-action="open-delete-account"
          className="ph-btn ph-sm ph-dan"
          onClick={() => setOpen(true)}
        >
          {t("open")}
        </button>
      )}
    </section>
  );
}

/** An option's words in the active language, else the raw value made readable. */
function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return (
    options.find((option) => option.value === value)?.label ??
    value.replace(/_/g, " ")
  );
}

export interface ProfileScreenProps {
  /** The GitHub round trip's outcome (`useGithubRestoreReturn`), until dismissed. */
  notice: GithubRestoreStatus | null;
  onDismissNotice: () => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSelectSection?: (section: ProfileSection) => void;
  focusSections?: boolean;
}

/**
 * v2/Profile with its data (`/profile` below md): today's user, statistics
 * (the badges), GitHub restore, edit form and account delete.
 */
export function ProfileScreen({
  notice,
  onDismissNotice,
  editing,
  onEditingChange,
  onSelectSection,
  focusSections,
}: ProfileScreenProps) {
  const { user } = useAuth();
  // Subscribes: the option labels are read through the module translator.
  useTranslations("profile");
  const tPhone = useTranslations("phone.profile");
  const intlLocale = useIntlLocale("en-US");
  const stats = useGeneralStats();
  const startRestore = useStartGithubRestore();
  const deleteAccount = useDeleteAccount();

  if (!user) {
    return (
      <div data-slot="phone-profile" className="ph-app ph-pf">
        <PhoneSkeleton label={tPhone("loading")}>
          <PhoneSkeletonCard className="h-16" />
          <PhoneSkeletonCard className="h-[160px]" />
        </PhoneSkeleton>
      </div>
    );
  }

  const access = membershipAccess(user);
  const salary = formatProfileSalary(user, intlLocale);

  return (
    <ProfileScreenView
      displayName={displayName(user)}
      initials={initials(user)}
      role={user.current_role || undefined}
      company={user.current_company || undefined}
      membershipLabels={
        access.state === "held" ? access.badges.map(membershipBadgeName) : []
      }
      availability={
        user.availability
          ? {
              value: user.availability,
              label: optionLabel(SelectOptions.AVAILABILITY, user.availability),
            }
          : undefined
      }
      bio={user.bio || undefined}
      details={{
        seniority: user.seniority_level
          ? optionLabel(SelectOptions.SENIORITY, user.seniority_level)
          : undefined,
        experienceYears: user.experience_years ?? undefined,
        location: user.location || undefined,
        salary: salary ?? undefined,
        linkedinUrl: user.linkedin_url || undefined,
      }}
      techStack={user.tech_stack ?? []}
      badges={mapLoad(fromQuery(stats), profileBadgeStates)}
      githubRestore={
        user.github_restore?.available
          ? {
              onRestore: () => startRestore.mutate(),
              pending: startRestore.isPending || startRestore.isSuccess,
            }
          : undefined
      }
      notice={
        notice ? (
          <GithubRestoreNotice status={notice} onDismiss={onDismissNotice} />
        ) : undefined
      }
      onEdit={() => onEditingChange(true)}
      editForm={
        editing ? (
          <UserProfileEditForm
            user={user}
            onSave={() => onEditingChange(false)}
            onCancel={() => onEditingChange(false)}
          />
        ) : undefined
      }
      username={user.username}
      onDeleteAccount={() => deleteAccount.mutate()}
      deletingAccount={deleteAccount.isPending}
      onSelectSection={onSelectSection}
      focusSections={focusSections}
    />
  );
}
