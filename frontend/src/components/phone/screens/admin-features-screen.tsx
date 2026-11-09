"use client";

import { useId } from "react";
import Link from "next/link";
import { Check, ChevronRight, X } from "lucide-react";
import {
  FEATURE_COPY,
  FEATURE_LIST_COPY,
  featureAccessKind,
  featureAccessShort,
  featureHref,
  formatFeatureCount,
  formatFeatureDate,
  type FeatureRow,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhonePill } from "@/components/phone/phone-pill";
import {
  PhoneAlertCard,
  PhoneEmptyCard,
} from "@/components/phone/phone-state-card";
import type { FeatureStage } from "@/services/types/features";

export interface AdminFeaturesScreenViewProps {
  /** `fromQuery(useAdminFeatures())`. */
  features: PhoneLoad<readonly FeatureRow[]>;
  /** A refetch over the cards on screen (`isFetching && !isLoading && !isError`): dims them. */
  refreshing?: boolean;
}

/** The stage pill (AdminFeatures l.67, AdminFeatureView l.68): Beta, or General with a success dot. */
export function FeatureStagePill({ stage }: { stage: FeatureStage }) {
  useFeatureCopyLocale();
  return stage === "general" ? (
    <PhonePill tone="ok" dot="var(--success)">
      {FEATURE_COPY.stage.general}
    </PhonePill>
  ) : (
    <PhonePill tone="pri">{FEATURE_COPY.stage.beta}</PhonePill>
  );
}

/** "Oct 20, 2026" once released, "Not released" in beta, a dash read "Not recorded" for a general one with no date. */
export function FeatureReleasedWords({
  stage,
  releasedAt,
}: {
  stage: FeatureStage;
  releasedAt: string | null;
}) {
  useFeatureCopyLocale();
  if (stage === "beta") return <>{FEATURE_COPY.notReleased}</>;
  if (!releasedAt) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="ph-sr">{FEATURE_COPY.notRecorded}</span>
      </>
    );
  }
  return <time dateTime={releasedAt}>{formatFeatureDate(releasedAt)}</time>;
}

/**
 * v3/AdminFeatures below md (under `AdminPhoneHeader`, which heads it
 * "Features" with its lead): one card per feature, each a link to its page.
 * Props in, the board out.
 */
export function AdminFeaturesScreenView({
  features,
  refreshing = false,
}: AdminFeaturesScreenViewProps) {
  useFeatureCopyLocale();

  return (
    <div data-slot="phone-admin-features" className="ph-app ph-ad-body">
      <PhoneLoadable
        state={features}
        loading={
          <PhoneSkeleton label={FEATURE_LIST_COPY.loading}>
            <PhoneSkeletonCard className="h-[180px]" />
            <PhoneSkeletonCard className="h-[180px]" />
          </PhoneSkeleton>
        }
        error={(failure) => (
          <PhoneAlertCard
            data-slot="features-error"
            title={FEATURE_LIST_COPY.loadErrorTitle}
            body={FEATURE_LIST_COPY.loadErrorBody}
            retryLabel={FEATURE_LIST_COPY.retry}
            onRetry={failure.onRetry}
            retrying={failure.retrying}
          />
        )}
      >
        {(list) =>
          list.length === 0 ? (
            <PhoneEmptyCard
              data-slot="features-empty"
              title={FEATURE_LIST_COPY.emptyTitle}
              body={FEATURE_LIST_COPY.emptyBody}
            />
          ) : (
            <ul
              data-slot="features"
              data-refreshing={refreshing || undefined}
              aria-busy={refreshing || undefined}
              className="ph-af-list"
            >
              {list.map((feature) => (
                <FeatureCard key={feature.key} feature={feature} />
              ))}
            </ul>
          )
        }
      </PhoneLoadable>
    </div>
  );
}

function FeatureCard({ feature }: { feature: FeatureRow }) {
  useFeatureCopyLocale();
  const nameId = useId();
  const description = feature.description?.trim();
  const has = feature.me.has;

  return (
    <li
      data-slot="feature-row"
      data-feature-key={feature.key}
      data-stage={feature.stage}
    >
      {/* Named by the feature (today's link); the rest is read as its content. */}
      <Link
        href={featureHref(feature.key)}
        aria-labelledby={nameId}
        data-slot="feature-link"
        className="ph-card ph-af-card"
      >
        <div className="ph-af-head">
          <div className="ph-af-main">
            <div className="ph-af-title">
              <span id={nameId} className="ph-af-name">
                {feature.name}
              </span>
              <FeatureStagePill stage={feature.stage} />
            </div>
            <p
              data-slot="feature-description"
              data-empty={description ? undefined : ""}
              className="ph-hint ph-af-desc"
            >
              {description || FEATURE_COPY.noDescription}
            </p>
          </div>
          <ChevronRight size={18} aria-hidden="true" className="ph-af-chev" />
        </div>
        <dl className="ph-dl ph-dl-3s ph-af-dl">
          <div>
            <dt>{FEATURE_LIST_COPY.columns.key}</dt>
            <dd data-slot="feature-key" className="ph-mono">
              {feature.key}
            </dd>
          </div>
          <div>
            <dt>{FEATURE_LIST_COPY.columns.betaUsers}</dt>
            <dd data-slot="feature-beta-count" className="ph-mono">
              {formatFeatureCount(feature.beta_user_count)}
            </dd>
          </div>
          <div>
            <dt>{FEATURE_LIST_COPY.columns.released}</dt>
            <dd data-slot="feature-released">
              <FeatureReleasedWords
                stage={feature.stage}
                releasedAt={feature.released_at}
              />
            </dd>
          </div>
        </dl>
        <p
          data-slot="feature-you"
          data-has={has}
          data-access={featureAccessKind(feature.me)}
          className="ph-af-you"
        >
          <span className="ph-af-you-k">{FEATURE_LIST_COPY.columns.you}</span>
          {has ? (
            <Check
              size={16}
              strokeWidth={2.25}
              aria-hidden="true"
              className="ph-af-yes"
            />
          ) : (
            <X
              size={16}
              strokeWidth={2.25}
              aria-hidden="true"
              className="ph-af-no"
            />
          )}
          <span className="ph-af-you-v">{featureAccessShort(feature.me)}</span>
        </p>
      </Link>
    </li>
  );
}
