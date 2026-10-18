import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartApplicationDialog } from "./start-application-dialog";
import { localCalendarDay } from "@/components/application-drafts/draft-copy";
import { StartApplicationFlow } from "./start-application-flow";
import { apiError, makeCv, makeDetail, makeJob } from "./job-test-fixtures";
import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { BaseCv } from "@/services/types/base-cv";
import type { MyFeature } from "@/services/types/features";

/**
 * T085 / AC7, AC8, AC9 (job flow): the start dialog wired to its data
 * (`StartApplicationFlow`), services mocked.
 */

const getJob = vi.fn();
const JOBS_AND_CVS_LIST = vi.hoisted(() => [
  { key: "jobs" as const, stage: "beta" as const },
  { key: "cvs" as const, stage: "beta" as const },
]);
const listBaseCvs = vi.fn();
const createFromJob = vi.fn();
const push = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: async () => JOBS_AND_CVS_LIST },
    jobs: { get: (...args: unknown[]) => getJob(...args) },
    baseCvs: { list: (...args: unknown[]) => listBaseCvs(...args) },
    applicationDrafts: {
      createFromJob: (...args: unknown[]) => createFromJob(...args),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const JOB = makeJob();
const ONE_CV: BaseCv[] = [makeCv("7", "Backend CV")];
/** The flow mounts only with both features; its master CV query needs `cvs`. */
const JOBS_AND_CVS: MyFeature[] = JOBS_AND_CVS_LIST;

function renderFlow() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(MY_FEATURES_QUERY_KEY, JOBS_AND_CVS);
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <StartApplicationFlow job={JOB} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const dialog = () =>
  screen.getByRole("dialog", { name: "Start an application" });
const radio = (name: string) => within(dialog()).getByRole("radio", { name });
const createDraft = () =>
  within(dialog()).getByRole("button", { name: "Create draft" });

beforeEach(() => {
  getJob.mockReset().mockResolvedValue(makeDetail());
  listBaseCvs.mockReset().mockResolvedValue(ONE_CV);
  createFromJob.mockReset().mockResolvedValue({ id: "555" });
  push.mockReset();
});

describe("StartApplicationFlow", () => {
  it("preselects the only master CV and the verbatim copy (AC7, AC9)", async () => {
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    expect(radio("Verbatim copy")).toBeChecked();
    expect(radio("Tailor by keywords")).not.toBeChecked();
    expect(within(dialog()).getByText("Fit 72%")).toBeInTheDocument();
  });

  it("creates a verbatim copy by default and lands on the CV step", async () => {
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    await userEvent.click(createDraft());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/applications/new-with-cv?id=555&step=cv",
      ),
    );
    expect(createFromJob).toHaveBeenCalledWith({
      job_id: "101",
      base_cv_id: "7",
      tailoring: "copy",
      application_date: localCalendarDay(),
    });
  });

  it("sends tailoring 'keywords' once the user opts in", async () => {
    renderFlow();
    await waitFor(() =>
      expect(radio("Tailor by keywords")).toBeInTheDocument(),
    );
    await userEvent.click(radio("Tailor by keywords"));
    await userEvent.click(createDraft());

    await waitFor(() =>
      expect(createFromJob).toHaveBeenCalledWith({
        job_id: "101",
        base_cv_id: "7",
        tailoring: "keywords",
        application_date: localCalendarDay(),
      }),
    );
  });

  it("sends neither CV nor tailoring without a CV, and still lands on step=cv", async () => {
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    await userEvent.click(radio("Without a CV"));
    expect(
      within(dialog()).queryByRole("radio", { name: "Tailor by keywords" }),
    ).toBeNull();
    expect(
      within(dialog()).queryByRole("radio", { name: "Verbatim copy" }),
    ).toBeNull();
    await userEvent.click(createDraft());

    await waitFor(() =>
      expect(createFromJob).toHaveBeenCalledWith({
        job_id: "101",
        application_date: localCalendarDay(),
      }),
    );
    expect(push).toHaveBeenCalledWith(
      "/applications/new-with-cv?id=555&step=cv",
    );
  });

  it("does not offer 'Tailor by keywords' for a blank description (R-026)", async () => {
    getJob.mockResolvedValue(makeDetail({ description_text: "  \n " }));
    renderFlow();
    await waitFor(() => expect(radio("Verbatim copy")).toBeChecked());
    // The detail has landed once its fit labels the CV.
    expect(await within(dialog()).findByText("Fit 72%")).toBeInTheDocument();
    expect(
      within(dialog()).queryByRole("radio", { name: "Tailor by keywords" }),
    ).toBeNull();
  });

  it("starts without a CV copy when the user has no master CV", async () => {
    listBaseCvs.mockResolvedValue([]);
    renderFlow();
    expect(
      await within(dialog()).findByText(
        "You have no master CV yet. The draft starts without a CV copy.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).toBeNull();
    await userEvent.click(createDraft());
    await waitFor(() =>
      expect(createFromJob).toHaveBeenCalledWith({
        job_id: "101",
        application_date: localCalendarDay(),
      }),
    );
  });

  it("shows a 422 inline: 'This job has no title to start from'", async () => {
    createFromJob.mockRejectedValue(
      apiError(422, "This job has no title to start from"),
    );
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    await userEvent.click(createDraft());

    const alert = await within(dialog()).findByRole("alert");
    expect(alert).toHaveTextContent("This job has no title to start from");
    expect(alert).toHaveAttribute("data-slot", "start-application-error");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a 404 inline, and a validation array as a readable message", async () => {
    createFromJob.mockRejectedValueOnce(apiError(404, "Job not found"));
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    await userEvent.click(createDraft());
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Job not found",
    );

    createFromJob.mockRejectedValueOnce(apiError(422, [{ msg: "bad" }]));
    await userEvent.click(createDraft());
    await waitFor(() =>
      expect(within(dialog()).getByRole("alert")).toHaveTextContent(
        "Something went wrong. Try again.",
      ),
    );
  });

  it("turns a 409 into 'Open draft' from the refetched job (AC8)", async () => {
    createFromJob.mockRejectedValue(
      apiError(409, "You already have an application for this job"),
    );
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    getJob.mockResolvedValue(
      makeDetail({ application: { id: "900", is_draft: true } }),
    );
    await userEvent.click(createDraft());

    const link = await within(dialog()).findByRole("link", {
      name: "Open draft",
    });
    expect(link).toHaveAttribute("href", "/applications/new-with-cv?id=900");
    expect(
      within(dialog()).getByText(
        "You already have an application for this job",
      ),
    ).toBeInTheDocument();
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(
      within(dialog()).queryByRole("button", { name: "Create draft" }),
    ).toBeNull();
  });

  it("offers 'Open application' when the existing one is finished", async () => {
    createFromJob.mockRejectedValue(
      apiError(409, "You already have an application for this job"),
    );
    renderFlow();
    await waitFor(() => expect(radio("Backend CV")).toBeChecked());
    getJob.mockResolvedValue(
      makeDetail({ application: { id: "901", is_draft: false } }),
    );
    await userEvent.click(createDraft());

    expect(
      await within(dialog()).findByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "/applications?focus=901");
  });
});

describe("StartApplicationDialog while pending", () => {
  it("marks Create draft aria-disabled and does not submit again", async () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <StartApplicationDialog
        open
        onOpenChange={onOpenChange}
        job={JOB}
        cvs={[{ id: "7", name: "Backend CV" }]}
        canTailor
        onSubmit={onSubmit}
        isPending
      />,
    );
    const button = createDraft();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
