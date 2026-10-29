import {
  CircleAlert,
  CircleCheck,
  Link2Off,
  SearchX,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  GITHUB_RESTORE_COPY,
  GITHUB_RESTORE_NOTICE_COPY,
  type GithubRestoreStatus,
} from "./github-restore-copy";

interface NoticeTone {
  role: "status" | "alert";
  icon: LucideIcon;
  container: string;
  tile: string;
}

// Text stays `foreground` on every tint; the tone is on the icon tile only.
const TONE: Record<GithubRestoreStatus, NoticeTone> = {
  restored: {
    role: "status",
    icon: CircleCheck,
    container: "border-success/30 bg-success/5",
    tile: "bg-success/10 text-success",
  },
  not_found: {
    role: "alert",
    icon: SearchX,
    container: "border-border bg-muted/40",
    tile: "bg-muted text-foreground/70",
  },
  has_data: {
    role: "alert",
    icon: TriangleAlert,
    container: "border-warning/30 bg-warning/5",
    tile: "bg-warning/10 text-warning",
  },
  already_bound: {
    role: "alert",
    icon: Link2Off,
    container: "border-warning/30 bg-warning/5",
    tile: "bg-warning/10 text-warning",
  },
  error: {
    role: "alert",
    icon: CircleAlert,
    container: "border-destructive/30 bg-destructive/5",
    tile: "bg-destructive/10 text-destructive",
  },
};

export interface GithubRestoreNoticeProps {
  status: GithubRestoreStatus;
  onDismiss?: () => void;
  className?: string;
}

/** The restore callback's outcome on `/profile`, shown once after the redirect. */
export function GithubRestoreNotice({
  status,
  onDismiss,
  className,
}: GithubRestoreNoticeProps) {
  const { role, icon: Icon, container, tile } = TONE[status];

  return (
    <div
      data-slot="github-restore-notice"
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
        {GITHUB_RESTORE_NOTICE_COPY[status]}
      </p>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label={GITHUB_RESTORE_COPY.dismiss}
          className="-my-1 -mr-1 shrink-0 text-muted-foreground"
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
