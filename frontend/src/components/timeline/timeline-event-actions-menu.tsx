"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { TIMELINE_EVENT_ACTION_COPY } from "@/components/timeline/timeline-copy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TimelineEventActionsMenuProps {
  /** Trigger's accessible name, e.g. "Event actions: Interview · Unknown, …". */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}

export function TimelineEventActionsMenu({
  label,
  onEdit,
  onDelete,
  className,
}: TimelineEventActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden />
            {TIMELINE_EVENT_ACTION_COPY.edit}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 aria-hidden />
            {TIMELINE_EVENT_ACTION_COPY.delete}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
