"use client";

import { APP_CONFIG } from "@/config";
import { GithubIcon } from "./brand-icons";
import { forwardRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

type SignInLinkProps = React.ComponentPropsWithoutRef<"a"> & {
  children: React.ReactNode;
};

export const SignInLink = forwardRef<HTMLAnchorElement, SignInLinkProps>(
  ({ children, ...props }, ref) => {
    const authHref = `${APP_CONFIG.baseURL}/auth/github/login`;

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
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await api.get("/auth/logout");
    } finally {
      queryClient.clear();
      window.location.href = "/";
    }
  };

  return (
    <Button onClick={handleLogout} variant="ghost">
      <LogOut className="h-4 w-4" />
      <span className="font-display">Logout</span>
    </Button>
  );
}
