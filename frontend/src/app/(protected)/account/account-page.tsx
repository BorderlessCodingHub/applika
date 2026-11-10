"use client";

import { AccountScreen } from "@/components/phone/screens/account-screen";
import { useIsPhone, useLeaveAtDesktop } from "@/hooks/use-is-phone";

/**
 * `/account`, the Account hub, exists on phones only: at md and up the rail
 * and the account menu hold its entries, so the address goes to the profile
 * (PRD 0021 Q9).
 */
export function AccountPage() {
  const isPhone = useIsPhone();
  useLeaveAtDesktop("/profile");

  if (!isPhone) return null;
  return <AccountScreen />;
}
