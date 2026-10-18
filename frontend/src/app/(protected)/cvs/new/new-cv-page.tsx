"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { BaseCvEditor } from "@/components/base-cvs/base-cv-editor";
import {
  baseCvSchema,
  emptyBaseCvValues,
  sectionErrorMessage,
  toBaseCvPayload,
} from "@/components/base-cvs/base-cv-schema";
import { BASE_CV_LIMIT_REASON } from "@/components/base-cvs/new-cv-card";
import { BASE_CVS_MAX, type CvFormValues } from "@/components/base-cvs/types";
import { BetaBadge } from "@/components/features/beta-badge";
import { FeatureGate } from "@/components/features/feature-gate";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { useCreateBaseCv } from "@/hooks/use-create-base-cv";
import { useHasFeature } from "@/hooks/use-features";

/**
 * `/cvs/new` — create a master CV.
 *
 * The cap is told twice, deliberately: here, before the user types anything,
 * when the list already holds `BASE_CVS_MAX`; and again as a toast carrying the
 * API's own `detail` if the server refuses the create with 409 — which is the
 * authority, and the only thing that can see a race between two tabs.
 *
 * Behind the `cvs` feature: without it, the app's "page not found" and no CV
 * request.
 */
export function NewCvPage() {
  return (
    <FeatureGate feature="cvs">
      <NewCvForm />
    </FeatureGate>
  );
}

function NewCvForm() {
  const beta = useHasFeature("cvs").stage === "beta";
  const router = useRouter();
  const { data: cvs, isLoading: isCountLoading } = useBaseCvs();
  const atLimit = (cvs?.length ?? 0) >= BASE_CVS_MAX;

  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: emptyBaseCvValues(),
  });

  const createMutation = useCreateBaseCv({
    onSuccess: () => router.push("/cvs"),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <LinkButton
          href="/cvs"
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
        >
          <ArrowLeft aria-hidden />
          Back to CVs
        </LinkButton>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              New master CV
            </h1>
            {beta ? <BetaBadge /> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Write it once. Every application you tailor starts from here.
          </p>
        </div>
      </div>

      {isCountLoading ? (
        // Neither branch until the count is known: rendering the form first and
        // swapping in the limit panel when the query lands would throw away
        // whatever the user typed in between.
        <div
          aria-busy
          aria-label="Loading your master CVs"
          className="grid gap-6 md:grid-cols-2"
        >
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : atLimit ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center"
        >
          <p className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">
            {BASE_CV_LIMIT_REASON}
          </p>
          <LinkButton href="/cvs" variant="outline" size="sm" className="mt-4">
            Back to CVs
          </LinkButton>
        </div>
      ) : (
        <BaseCvEditor
          form={form}
          onSubmit={form.handleSubmit(
            (values) => createMutation.mutate(toBaseCvPayload(values)),
            // Scalars show their error inline; a section list has no slot of
            // its own, so its message is told in a toast instead of nowhere.
            (errors) => {
              const message = sectionErrorMessage(errors);
              if (message) toast.error(message);
            },
          )}
          submitLabel="Create CV"
          onCancel={() => router.push("/cvs")}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}
