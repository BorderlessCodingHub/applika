"use client";

import { APP_CONFIG } from "@/config";
import { GithubIcon } from "./brand-icons";
import { forwardRef } from "react";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type SignInLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  children: React.ReactNode;
};

export const SignInLink = forwardRef<HTMLAnchorElement, SignInLinkProps>(
  ({ children, ...props }, ref) => {
    const authHref = `${APP_CONFIG.envs.apiBaseURL}/auth/github/login`;

    return (
      <a ref={ref} href={authHref} {...props}>
        <GithubIcon className="h-5 w-h-5" />
        {children}
      </a>
    );
  },
);

SignInLink.displayName = "SignInLink";

export function LogoutButton() {
  const { logout } = useAuth();

  return (
    <Button onClick={logout} variant="ghost">
      <LogOut className="h-4 w-4" />
      <span className="font-display">Logout</span>
    </Button>
  );
}
