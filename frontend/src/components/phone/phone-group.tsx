"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PhoneGroup({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="phone-group"
      className={cn("ph-group", className)}
      {...props}
    />
  );
}

interface RowContent {
  /** The row's whole accessible name. */
  label: ReactNode;
  /** The `.ph-ic` tile before the label (the Account board's Workspace rows). */
  icon?: LucideIcon;
  /** The muted words after the label, read as the row's description. */
  meta?: ReactNode;
  metaMono?: boolean;
  /** After the meta (a Beta pill, a chevron), read as the description too. */
  trailing?: ReactNode;
  /** `data-row` on the link or button, for tests. */
  rowKey?: string;
  /** A button row that opens a dialog (`aria-haspopup`). */
  popup?: "dialog";
  className?: string;
}

export type PhoneGroupRowProps = RowContent &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

export function PhoneGroupRow({
  href,
  onClick,
  label,
  icon: Icon,
  meta,
  metaMono = false,
  trailing,
  rowKey,
  popup,
  className,
}: PhoneGroupRowProps) {
  const labelId = useId();
  const metaId = useId();
  const trailingId = useId();
  const describedBy =
    [
      meta !== undefined ? metaId : null,
      trailing !== undefined ? trailingId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const body = (
    <>
      {Icon ? (
        <span className="ph-ic" aria-hidden="true">
          <Icon size={16} />
        </span>
      ) : null}
      <span id={labelId} className="ph-grow">
        {label}
      </span>
      {meta !== undefined ? (
        <span id={metaId} className={cn("ph-meta", metaMono && "ph-mono")}>
          {meta}
        </span>
      ) : null}
      {trailing !== undefined ? (
        <span id={trailingId} className="contents">
          {trailing}
        </span>
      ) : null}
    </>
  );

  const shared = {
    "data-slot": "phone-group-row",
    "data-row": rowKey,
    "aria-labelledby": labelId,
    "aria-describedby": describedBy,
    className: cn("ph-row", className),
  };

  return (
    <li>
      {href !== undefined ? (
        <Link href={href} {...shared}>
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-haspopup={popup}
          {...shared}
        >
          {body}
        </button>
      )}
    </li>
  );
}
