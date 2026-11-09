"use client";

import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";
import {
  AdminPhoneContent,
  AdminPhoneHeader,
  isAdminBoardPath,
} from "@/components/phone/screens/admin-phone-header";
import { useIsPhone } from "@/hooks/use-is-phone";

/**
 * Every `/admin/*` page, for administrators only (`AdminGuard`). Below md
 * the Admin board's header and chips sit over every section; Dashboard,
 * Jobs and Report webhooks render their boards, the other sections today's
 * content inside the header's 20px sides (PRD 0021). At md and up today's
 * `AdminNav` over the page, unchanged.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isPhone = useIsPhone();
  const pathname = usePathname();

  return (
    <AdminGuard>
      {isPhone ? (
        <>
          <AdminPhoneHeader activePath={pathname} />
          {isAdminBoardPath(pathname) ? (
            children
          ) : (
            <AdminPhoneContent>{children}</AdminPhoneContent>
          )}
        </>
      ) : (
        <>
          <AdminNav />
          {children}
        </>
      )}
    </AdminGuard>
  );
}
