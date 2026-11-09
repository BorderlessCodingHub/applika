"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAdminPager } from "@/components/admin/admin-format";
import { cn } from "@/lib/utils";

export interface PhonePagerProps {
  /** 1-based. */
  page: number;
  totalPages: number;
  /** Called with the 1-based page to show; never past the first or the last. */
  onPageChange: (page: number) => void;
  /** Names the control as a `nav` landmark (today's "Company pages"); absent, a plain row. */
  label?: string;
  className?: string;
}

/**
 * The v3 boards' pages row: Previous, "Page N of M", Next. Nothing when
 * there is one page or none (PRD 0022). The ends are `aria-disabled`, never
 * `disabled`, so focus stays on the button that reached them.
 */
export function PhonePager({
  page,
  totalPages,
  onPageChange,
  label,
  className,
}: PhonePagerProps) {
  const pager = useAdminPager();
  if (totalPages <= 1) return null;

  const first = page <= 1;
  const last = page >= totalPages;
  const Root = label ? "nav" : "div";

  return (
    <Root
      aria-label={label}
      data-slot="phone-pager"
      className={cn("ph-pager", className)}
    >
      <button
        type="button"
        aria-label={pager.previous}
        aria-disabled={first || undefined}
        data-action="previous-page"
        className="ph-iconbtn"
        onClick={() => {
          if (!first) onPageChange(page - 1);
        }}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span aria-live="polite" className="ph-mono ph-pager-n">
        {pager.page(page, totalPages)}
      </span>
      <button
        type="button"
        aria-label={pager.next}
        aria-disabled={last || undefined}
        data-action="next-page"
        className="ph-iconbtn"
        onClick={() => {
          if (!last) onPageChange(page + 1);
        }}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </Root>
  );
}
