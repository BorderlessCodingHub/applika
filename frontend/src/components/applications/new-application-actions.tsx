import { useLocale } from "next-intl";
import { FilePlus2Icon, PlusIcon } from "lucide-react";

import { NEW_WITH_CV_HREF } from "@/components/application-drafts/draft-copy";
import { APPLICATIONS_PAGE_COPY } from "@/components/applications/application-card-copy";
import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The applications page's create actions: `New Application` opens the side
 * sheet as before; `New with CV` navigates to its own page, and only shows
 * with the `cvs` feature (`showNewWithCv`).
 */
export function NewApplicationActions({
  onNewApplication,
  newWithCvHref = NEW_WITH_CV_HREF,
  showNewWithCv = false,
  className,
}: {
  onNewApplication: () => void;
  newWithCvHref?: string;
  showNewWithCv?: boolean;
  className?: string;
}) {
  // Subscribes: the copy object reads the active language.
  useLocale();
  return (
    <div
      data-slot="new-application-actions"
      className={cn(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center",
        className,
      )}
    >
      <Button onClick={onNewApplication} size="lg">
        <PlusIcon aria-hidden data-icon="inline-start" />
        {APPLICATIONS_PAGE_COPY.newApplication}
      </Button>
      {showNewWithCv ? (
        <LinkButton href={newWithCvHref} variant="outline" size="lg">
          <FilePlus2Icon aria-hidden data-icon="inline-start" />
          {APPLICATIONS_PAGE_COPY.newWithCv}
        </LinkButton>
      ) : null}
    </div>
  );
}
