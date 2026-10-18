"use client";

import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AxiosError } from "axios";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { BaseCvEditor } from "@/components/base-cvs/base-cv-editor";
import { ExportCvButton } from "@/components/base-cvs/export-cv-button";
import {
  baseCvSchema,
  baseCvToFormValues,
  emptyBaseCvValues,
  sectionErrorMessage,
  toBaseCvPayload,
} from "@/components/base-cvs/base-cv-schema";
import { BetaBadge } from "@/components/features/beta-badge";
import { FeatureGate } from "@/components/features/feature-gate";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CvFormValues } from "@/components/base-cvs/types";
import { useBaseCv } from "@/hooks/use-base-cv";
import { useExportBaseCvMarkdown } from "@/hooks/use-export-base-cv-markdown";
import { useExportBaseCvPdf } from "@/hooks/use-export-base-cv-pdf";
import { useHasFeature } from "@/hooks/use-features";
import { useUpdateBaseCv } from "@/hooks/use-update-base-cv";
import { getApiError } from "@/lib/api-client";

function EditorMessage({
  title,
  body,
  alert,
}: {
  title: string;
  body: string;
  /** Announce it. Only for something that WENT WRONG, never for a static state. */
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="rounded-xl border border-dashed border-border px-6 py-16 text-center"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-pretty text-muted-foreground">
        {body}
      </p>
      <LinkButton href="/cvs" variant="outline" size="sm" className="mt-4">
        Back to CVs
      </LinkButton>
    </div>
  );
}

/**
 * `/cvs/editor?id=` — edit one master CV.
 *
 * The form is seeded ONCE, the first time the query resolves: a later refetch
 * (the list invalidation after a save triggers one) must never stomp what the
 * user is typing. Seeding from the server response is also what round-trips the
 * client-generated section item ids — they are never regenerated on load.
 *
 * The PDF export lives HERE and not on `/cvs/new`: it is the server that
 * typesets it (ADR 0011) from the STORED CV, so there is nothing to render
 * until the CV has been saved once.
 *
 * Behind the `cvs` feature: without it, the app's "page not found" and no CV
 * request.
 */
export function CvEditorPage() {
  return (
    <FeatureGate feature="cvs">
      <CvEditor />
    </FeatureGate>
  );
}

function CvEditor() {
  const beta = useHasFeature("cvs").stage === "beta";
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const { data: cv, isLoading, error } = useBaseCv(id);

  const form = useForm<CvFormValues>({
    resolver: zodResolver(baseCvSchema),
    defaultValues: emptyBaseCvValues(),
  });

  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (!cv || seededId.current === cv.id) return;
    seededId.current = cv.id;
    form.reset(baseCvToFormValues(cv));
  }, [cv, form]);

  const updateMutation = useUpdateBaseCv(id ?? "", {
    onSuccess: () => router.push("/cvs"),
  });

  // One instance, the CV named at press time (KODI-009 moved the id and the
  // name onto the mutation variables so `/cvs` can export any of its tiles).
  // Named from the SERVER's copy of the CV, never from the form: the fallback
  // filename has to match the document the server renders, not the unsaved
  // edits on screen.
  const exportMutation = useExportBaseCvPdf();
  const exportMarkdownMutation = useExportBaseCvMarkdown();

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
              Edit master CV
            </h1>
            {beta ? <BetaBadge /> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {cv ? cv.name : "Change anything and save it back."}
          </p>
        </div>
      </div>

      {!id ? (
        <EditorMessage
          title="No CV selected"
          body="Open a CV from your list to edit it."
        />
      ) : error ? (
        <EditorMessage
          alert
          title="Could not load this CV"
          body={getApiError(error as AxiosError)}
        />
      ) : isLoading || !cv ? (
        <div
          aria-busy
          aria-label="Loading this master CV"
          className="grid gap-6 md:grid-cols-2"
        >
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <BaseCvEditor
          form={form}
          onSubmit={form.handleSubmit(
            (values) => updateMutation.mutate(toBaseCvPayload(values)),
            (errors) => {
              const message = sectionErrorMessage(errors);
              if (message) toast.error(message);
            },
          )}
          submitLabel="Save changes"
          isSubmitting={updateMutation.isPending}
          actions={
            <ExportCvButton
              onExport={() =>
                exportMutation.mutate({ id: id ?? "", name: cv?.name ?? "" })
              }
              isExporting={exportMutation.isPending}
              onExportMarkdown={() =>
                exportMarkdownMutation.mutate({
                  id: id ?? "",
                  name: cv?.name ?? "",
                })
              }
              isExportingMarkdown={exportMarkdownMutation.isPending}
            />
          }
        />
      )}
    </div>
  );
}
