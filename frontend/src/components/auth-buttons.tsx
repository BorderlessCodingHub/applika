"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type SignInLinkProps = Omit<React.ComponentPropsWithoutRef<"a">, "href"> & {
  children: React.ReactNode;
};

/** Every "Sign in" call to action leads to applika's Borderless sign-in page. */

export const SignInLink = forwardRef<HTMLAnchorElement, SignInLinkProps>(
  ({ children, ...props }, ref) => {
    return (
      <Link ref={ref} href="/login" {...props}>
        {children}
      </Link>
    );
  },
);

SignInLink.displayName = "SignInLink";

export function LogoutButton() {
  const { logout } = useAuth();
  const t = useTranslations("auth");

  return (
    <Button onClick={logout} variant="ghost">
      <LogOut className="h-4 w-4" />
      <span className="font-display">{t("logout")}</span>
    </Button>
  );
}
