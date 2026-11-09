"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "@/components/phone/phone-load";
import { PhoneStat, PhoneStatGrid } from "@/components/phone/phone-stat-grid";
import { fromQuery, mapLoad } from "@/components/phone/phone-query-load";
import {
  useAdminStats,
  useTopPlatforms,
  useUserGrowth,
} from "@/hooks/use-admin";

export interface AdminDashboardStats {
  totalUsers: number;
  active30d: number;
  new7d: number;
  applications: number;
  /** A percentage, as `global_success_rate` sends it (6.8 is 6.8%). */
  successRate: number;
  avgPerUser: number;
}

export interface AdminGrowthMonth {
  /** The month's first day, UTC midnight (`UserGrowthPoint.date`). */
  month: Date;
  newUsers: number;
}

export interface AdminTopPlatform {
  name: string;
  /** `total_across_users`. */
  total: number;
}

export interface AdminScreenViewProps {
  stats: PhoneLoad<AdminDashboardStats>;
  /** The last six months, oldest first (`useUserGrowth()`). */
  growth: PhoneLoad<readonly AdminGrowthMonth[]>;
  /** `useTopPlatforms()`, in the API's order. */
  topPlatforms: PhoneLoad<readonly AdminTopPlatform[]>;
}

/** A bar's height at most, in px (v2/Admin). */
const BAR_MAX = 70;

/** A section's error inside a board card: the card is already drawn. */
const INSET_ERROR = "mt-3 rounded-none bg-transparent p-0 shadow-none";

/** v2/Admin's Dashboard below md (under `AdminPhoneHeader`): props in, the board out. */
export function AdminScreenView({
  stats,
  growth,
  topPlatforms,
}: AdminScreenViewProps) {
  const t = useTranslations("admin.dashboard");
  const tPhone = useTranslations("phone.admin");
  const format = useFormatter();
  const growthId = useId();
  const topId = useId();

  const count = (value: number) => format.number(value);
  const decimal = (value: number) =>
    format.number(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const month = (date: Date, width: "short" | "long") =>
    format.dateTime(date, { month: width, timeZone: "UTC" }).replace(".", "");

  return (
    <div data-slot="phone-admin-dashboard" className="ph-app ph-ad-body">
      <PhoneLoadable
        state={stats}
        loading={
          <PhoneSkeleton label={tPhone("loading")}>
            <PhoneSkeletonCard className="h-[214px] rounded-[14px]" />
          </PhoneSkeleton>
        }
      >
        {(data) => (
          <PhoneStatGrid data-slot="admin-stats">
            <PhoneStat
              term={t("stats.total_users")}
              mono
              valueClassName="ph-dd-num"
            >
              {count(data.totalUsers)}
            </PhoneStat>
            <PhoneStat
              term={t("stats.active_30d")}
              mono
              valueClassName="ph-dd-num"
            >
              {count(data.active30d)}
            </PhoneStat>
            <PhoneStat term={t("stats.new_7d")} mono valueClassName="ph-dd-num">
              {count(data.new7d)}
            </PhoneStat>
            <PhoneStat
              term={t("stats.total_apps")}
              mono
              valueClassName="ph-dd-num"
            >
              {count(data.applications)}
            </PhoneStat>
            <PhoneStat
              term={t("stats.success_rate")}
              mono
              valueClassName="ph-dd-num"
            >
              {decimal(data.successRate)}%
            </PhoneStat>
            <PhoneStat
              term={t("stats.avg_apps")}
              mono
              valueClassName="ph-dd-num"
            >
              {decimal(data.avgPerUser)}
            </PhoneStat>
          </PhoneStatGrid>
        )}
      </PhoneLoadable>

      <section
        aria-labelledby={growthId}
        data-slot="admin-growth"
        className="ph-card"
      >
        <div className="ph-ad-card-head">
          <h2 id={growthId} className="ph-ad-card-h">
            {t("growth.newUsersTitle")}
          </h2>
          <span className="ph-ad-card-note">
            {tPhone("lastMonths", { count: 6 })}
          </span>
        </div>
        <PhoneLoadable
          state={growth}
          errorClassName={INSET_ERROR}
          loading={
            <PhoneSkeleton label={tPhone("loading")} className="mt-4">
              <PhoneSkeletonCard className="h-[110px] rounded-md shadow-none" />
            </PhoneSkeleton>
          }
        >
          {(months) => {
            if (months.length === 0) {
              return <p className="ph-hint ph-ad-none">{tPhone("noData")}</p>;
            }
            const max = Math.max(1, ...months.map((m) => m.newUsers));
            const first = months[0];
            const last = months[months.length - 1];
            return (
              <div
                role="img"
                aria-label={tPhone("growthChart", {
                  first: count(first.newUsers),
                  firstMonth: month(first.month, "long"),
                  last: count(last.newUsers),
                  lastMonth: month(last.month, "long"),
                })}
                className="ph-ad-bars"
              >
                {months.map((m) => (
                  <div key={m.month.toISOString()} className="ph-ad-bar-col">
                    <span className="ph-mono ph-ad-bar-v">
                      {count(m.newUsers)}
                    </span>
                    <div
                      className="ph-ad-bar"
                      style={{
                        height: `${Math.round((m.newUsers / max) * BAR_MAX)}px`,
                      }}
                    />
                    <span className="ph-ad-bar-m">
                      {month(m.month, "short")}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        </PhoneLoadable>
      </section>

      <section
        aria-labelledby={topId}
        data-slot="admin-top-platforms"
        className="ph-card"
      >
        <h2 id={topId} className="ph-ad-card-h ph-ad-top-h">
          {t("top.platforms")}
        </h2>
        <PhoneLoadable
          state={topPlatforms}
          errorClassName={INSET_ERROR}
          loading={
            <PhoneSkeleton label={tPhone("loading")}>
              <PhoneSkeletonCard className="h-[160px] rounded-md shadow-none" />
            </PhoneSkeleton>
          }
        >
          {(platforms) =>
            platforms.length === 0 ? (
              <p className="ph-hint ph-ad-none">{tPhone("noData")}</p>
            ) : (
              <ul className="ph-ad-top-list">
                {platforms.map((platform) => (
                  <li key={platform.name} className="ph-ad-top-row">
                    <span className="ph-ad-top-label">{platform.name}</span>
                    <span className="ph-mono ph-ad-top-v">
                      {count(platform.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </PhoneLoadable>
      </section>
    </div>
  );
}

/** Months the board's growth chart draws. */
const GROWTH_MONTHS = 6;

/**
 * v2/Admin's Dashboard with its data (`/admin` below md, under
 * `AdminPhoneHeader`, inside `AdminGuard`): today's platform stats, user
 * growth (the last six months) and top platforms. Its own component, so the
 * page's hook order never changes when the width crosses md.
 */
export function AdminScreen() {
  const stats = useAdminStats();
  const growth = useUserGrowth();
  const platforms = useTopPlatforms();

  return (
    <AdminScreenView
      stats={mapLoad(fromQuery(stats), (data) => ({
        totalUsers: data.total_users,
        active30d: data.active_users_30d,
        new7d: data.new_users_7d,
        applications: data.total_applications,
        successRate: data.global_success_rate,
        avgPerUser: data.avg_applications_per_user,
      }))}
      growth={mapLoad(fromQuery(growth), (points) =>
        points.slice(-GROWTH_MONTHS).map((point) => ({
          month: new Date(`${point.date.slice(0, 10)}T00:00:00Z`),
          newUsers: point.new_users,
        })),
      )}
      topPlatforms={mapLoad(fromQuery(platforms), (rows) =>
        rows.map((row) => ({ name: row.name, total: row.total_across_users })),
      )}
    />
  );
}
