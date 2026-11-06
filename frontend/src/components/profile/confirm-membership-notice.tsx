"use client";

import {
  ConfirmMembershipForm,
  type ConfirmMembershipFormProps,
} from "@/components/badges/confirm-membership-form";
import { cn } from "@/lib/utils";

export type ConfirmMembershipNoticeProps = Omit<
  ConfirmMembershipFormProps,
  "titleAs"
>;

/** The profile's confirm card, shown while `borderless.status` is not `active`. */
export function ConfirmMembershipNotice({
  className,
  ...props
}: ConfirmMembershipNoticeProps) {
  return (
    <section
      data-slot="confirm-membership-notice"
      className={cn(
        "overflow-hidden rounded-xl border border-warning/30 bg-card p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <ConfirmMembershipForm titleAs="h2" {...props} />
    </section>
  );
}
