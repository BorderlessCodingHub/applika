import {
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DISCORD_LINK_STATUSES = ["linked", "conflict", "error"] as const;

export type DiscordLinkStatus = (typeof DISCORD_LINK_STATUSES)[number];

export function isDiscordLinkStatus(
  value: unknown,
): value is DiscordLinkStatus {
  return (
    typeof value === "string" &&
    (DISCORD_LINK_STATUSES as readonly string[]).includes(value)
  );
}

interface NoticeVariant {
  message: string;
  role: "status" | "alert";
  icon: LucideIcon;
  container: string;
  tile: string;
}

const NOTICE: Record<DiscordLinkStatus, NoticeVariant> = {
  linked: {
    message: "Discord connected. Your reports and feedback will mention you.",
    role: "status",
    icon: CircleCheck,
    container: "border-success/30 bg-success/5",
    tile: "bg-success/10 text-success",
  },
  conflict: {
    message: "This Discord account is linked to another Applika account",
    role: "alert",
    icon: TriangleAlert,
    container: "border-warning/30 bg-warning/5",
    tile: "bg-warning/10 text-warning",
  },
  error: {
    message: "Discord was not connected, try again",
    role: "alert",
    icon: CircleAlert,
    container: "border-destructive/30 bg-destructive/5",
    tile: "bg-destructive/10 text-destructive",
  },
};

export interface DiscordLinkNoticeProps {
  status: DiscordLinkStatus;
  onDismiss?: () => void;
  className?: string;
}

export function DiscordLinkNotice({
  status,
  onDismiss,
  className,
}: DiscordLinkNoticeProps) {
  const { message, role, icon: Icon, container, tile } = NOTICE[status];

  return (
    <div
      data-slot="discord-link-notice"
      data-status={status}
      className={cn(
        "flex animate-fade-in items-center gap-3 rounded-lg border p-3 text-sm motion-reduce:animate-none sm:gap-4 sm:p-4",
        container,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          tile,
        )}
      >
        <Icon className="size-4" />
      </span>
      {/* Role on the message, not the box, so the dismiss label is not announced. */}
      <p
        role={role}
        className="min-w-0 flex-1 font-medium text-pretty text-foreground"
      >
        {message}
      </p>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="-my-1 -mr-1 shrink-0 text-muted-foreground"
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
