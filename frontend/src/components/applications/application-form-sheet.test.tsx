import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import type { Application } from "@/services/types/applications";

/**
 * Characterization test (KODI-033, T061) written BEFORE extracting
 * `application-fields.tsx` out of this sheet (T065): it pins the payloads the
 * sheet sends on create/edit (existing company id, a brand-new
 * `{name, url}`, a name-only company) and the validation messages, so the
 * extraction cannot silently change either. Every hook the sheet calls is
 * mocked — no QueryClientProvider needed, since neither `CompanySelect` nor
 * `PlatformSelect` touches React Query directly.
 */

const submit = vi.fn().mockResolvedValue(undefined);
const fetchCompanies = vi.fn().mockResolvedValue([
  {
    id: "co-1",
    name: "Acme Inc",
    url: "https://acme.example",
    is_public: true,
  },
]);
const createPlatformOutcome = vi.fn();
const createCompanyMock = vi.fn();

vi.mock("@/hooks/use-applications", () => ({
  useApplicationMutate: () => ({ submit, isPending: false }),
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompanySearch: () => ({ fetchCompanies, isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-create-platform", () => ({
  useCreatePlatformOutcome: () => createPlatformOutcome,
}));

vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: createCompanyMock }),
}));

vi.mock("@/hooks/use-platforms", () => ({
  usePlatforms: () => ({
    data: [
      { id: "p-1", name: "LinkedIn", url: null, is_public: true },
      { id: "p-2", name: "Indeed", url: "https://indeed.com", is_public: true },
    ],
    isLoading: false,
  }),
}));

// The real DatePickerInput is a calendar popover with no keyboard-typable
// text field; this characterization test cares about the SUBMITTED payload,
// not the calendar widget, so it is swapped for a plain controlled input.
vi.mock("@/components/ui/date-picker", () => ({
  DatePickerInput: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (value: string | undefined) => void;
  }) => (
    <input
      aria-label="Application Date"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
    />
  ),
}));

async function pickPlatform(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: /platform/i }));
  await user.click(await screen.findByRole("option", { name: "LinkedIn" }));
}

async function fillRequiredScalarFields(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.type(
    screen.getByPlaceholderText(/senior engineer/i),
    "Senior Engineer",
  );
  await pickPlatform(user);
  await user.click(screen.getByRole("combobox", { name: /source/i }));
  await user.click(await screen.findByRole("option", { name: /^active/i }));
  await user.type(screen.getByLabelText(/application date/i), "2025-01-15");
}

beforeEach(() => {
  submit.mockClear();
  fetchCompanies.mockClear();
});

describe("ApplicationFormSheet — wide sheet, larger title (KODI-036, AC6/AC7)", () => {
  it("opens up to 4xl with a larger, unchanged-wording title", () => {
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    // The Sheet is a Radix Dialog: its content portals to `document.body`,
    // outside the render container.
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    expect(sheet?.className ?? "").toContain("sm:max-w-4xl");

    const title = screen.getByRole("heading", { name: "New Application" });
    expect(title.className).toContain("font-display");
    expect(title.className).toContain("text-xl");
  });

  it("keeps the same title words when editing", () => {
    render(
      <ApplicationFormSheet
        open
        onOpenChange={() => {}}
        application={{
          id: "app-1",
          company_id: "co-1",
          company_name: "Acme Inc",
          platform_id: "p-1",
          role: "Senior Engineer",
          mode: "active",
          application_date: "2025-01-10",
          finalized: false,
          finalized_at: null,
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Edit Application" }),
    ).toBeInTheDocument();
  });
});

describe("ApplicationFormSheet — create payload (characterization)", () => {
  it("sends an existing company id when one is picked", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await waitFor(() => expect(fetchCompanies).toHaveBeenCalled());
    await user.click(await screen.findByText("Acme Inc"));

    await fillRequiredScalarFields(user);
    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const payload = submit.mock.calls[0][0];
    expect(payload.company).toBe("co-1");
    expect(payload.platform_id).toBe("p-1");
  });

  it("resolves a brand-new company with a URL to its id (R-021)", async () => {
    createCompanyMock.mockResolvedValue({
      company: {
        id: "co-2",
        name: "Brand New Co",
        url: "https://brandnew.example",
        is_public: false,
      },
      created: true,
    });
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Brand New Co",
    );
    await user.click(await screen.findByText('Create "Brand New Co"'));
    await user.type(screen.getByLabelText(/^url/i), "https://brandnew.example");
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    await fillRequiredScalarFields(user);
    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(createCompanyMock).toHaveBeenCalledWith({
      name: "Brand New Co",
      url: "https://brandnew.example",
    });
    const payload = submit.mock.calls[0][0];
    expect(payload.company).toBe("co-2");
  });

  it("keeps a name-only company as free text (company_id null, AC16)", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Just A Name",
    );
    await user.click(await screen.findByText('Create "Just A Name"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    await fillRequiredScalarFields(user);
    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const payload = submit.mock.calls[0][0];
    expect(payload.company).toEqual({ name: "Just A Name", url: null });
  });
});

describe("ApplicationFormSheet — validation (characterization)", () => {
  it("shows Role and Platform required messages on empty submit", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    expect(await screen.findByText("Role is required")).toBeInTheDocument();
    expect(screen.getByText("Platform is required")).toBeInTheDocument();
    const platformTrigger = screen.getByRole("combobox", { name: "Platform" });
    expect(platformTrigger).toHaveAttribute("aria-invalid", "true");
    // KODI-035 remediation r1 (QA F2): the error text must be LINKED to the
    // trigger via aria-describedby, same as the Company field below.
    expect(platformTrigger).toHaveAccessibleDescription("Platform is required");
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows a Company required message on empty submit, marks the trigger invalid, and clears once a company is picked (QA round 1 B1)", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    expect(await screen.findByText("Company is required")).toBeInTheDocument();
    const companyTrigger = screen.getByRole("combobox", { name: "Company" });
    expect(companyTrigger).toHaveAttribute("aria-invalid", "true");
    expect(companyTrigger).toHaveAccessibleDescription("Company is required");

    await user.click(companyTrigger);
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Just Enough",
    );
    await user.click(await screen.findByText('Create "Just Enough"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    expect(screen.queryByText("Company is required")).not.toBeInTheDocument();
    expect(companyTrigger).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("ApplicationFormSheet — edit payload (characterization)", () => {
  const application: Application = {
    id: "app-1",
    company_id: "co-1",
    company_name: "Acme Inc",
    platform_id: "p-1",
    role: "Senior Engineer",
    mode: "active",
    application_date: "2025-01-10",
    finalized: false,
    finalized_at: null,
  };

  it("submits Save changes with the existing values untouched", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet
        open
        onOpenChange={() => {}}
        application={application}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const payload = submit.mock.calls[0][0];
    expect(payload.company).toBe("co-1");
    expect(payload.role).toBe("Senior Engineer");
    expect(payload.platform_id).toBe("p-1");
  });
});

describe("ApplicationFormSheet — application date, own local today (KODI-034, T147)", () => {
  // Owner order 2026-09-26 (found in KODI-036): `new Date(v) <= new Date()`
  // refused the user's own TODAY whenever their local calendar day was
  // already ahead of UTC's. On a UTC-hosted CI runner, faking the system
  // time alone is not enough to reproduce that — local day would equal UTC
  // day and the old code would still pass. Forcing the runtime TZ to
  // Asia/Tokyo (UTC+9) is what makes the local calendar day 2026-09-27 while
  // UTC is still 2026-09-26, which is exactly the bug: this test FAILS if
  // `application-form-sheet.tsx` is reverted to the `Date`-object
  // comparison, on ANY host TZ including CI's UTC.
  beforeEach(() => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-09-26T17:00:00Z is 2026-09-27 02:00 local in Asia/Tokyo (UTC+9).
    vi.setSystemTime(new Date("2026-09-26T17:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts the user's own local today (2026-09-27) even though UTC is still 2026-09-26", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText("Acme Inc"));

    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Senior Engineer",
    );
    await pickPlatform(user);
    await user.click(screen.getByRole("combobox", { name: /source/i }));
    await user.click(await screen.findByRole("option", { name: /^active/i }));
    await user.type(screen.getByLabelText(/application date/i), "2026-09-27");

    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(
      screen.queryByText("Date cannot be in the future"),
    ).not.toBeInTheDocument();
  });

  it("still refuses a later day (2026-09-28) as in the future", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText("Acme Inc"));

    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Senior Engineer",
    );
    await pickPlatform(user);
    await user.click(screen.getByRole("combobox", { name: /source/i }));
    await user.click(await screen.findByRole("option", { name: /^active/i }));
    await user.type(screen.getByLabelText(/application date/i), "2026-09-28");

    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    expect(
      await screen.findByText("Date cannot be in the future"),
    ).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("ApplicationFormSheet — adds a platform inline (AC14, T082)", () => {
  it("creates a new platform and selects it", async () => {
    createPlatformOutcome.mockResolvedValue({
      status: "created",
      platform: { id: "p-3", name: "Wellfound", url: null, is_public: false },
    });

    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.type(
      screen.getByPlaceholderText(/search or add a platform/i),
      "Wellfound",
    );
    await user.click(await screen.findByText('Create "Wellfound"'));
    await user.click(screen.getByRole("button", { name: /^add platform$/i }));

    await waitFor(() =>
      expect(createPlatformOutcome).toHaveBeenCalledWith({
        name: "Wellfound",
        url: null,
      }),
    );
  });
});
