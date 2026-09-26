import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

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

vi.mock("@/hooks/use-applications", () => ({
  useApplicationMutate: () => ({ submit, isPending: false }),
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompanySearch: () => ({ fetchCompanies, isLoading: false, error: null }),
}));

vi.mock("@/hooks/use-create-platform", () => ({
  useCreatePlatformOutcome: () => createPlatformOutcome,
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

vi.mock("@/contexts/supports-context", () => ({
  useSupports: () => ({
    supports: {
      platforms: [
        { id: "p-1", name: "LinkedIn", url: null, is_public: true },
        {
          id: "p-2",
          name: "Indeed",
          url: "https://indeed.com",
          is_public: true,
        },
      ],
    },
    isLoading: false,
  }),
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

describe("ApplicationFormSheet — create payload (characterization)", () => {
  it("sends an existing company id when one is picked", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByText("Search companies…"));
    await user.type(screen.getByPlaceholderText(/search companies/i), "Acme");
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

  it("sends {name, url} for a brand-new company with a URL", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByText("Search companies…"));
    const search = screen.getByPlaceholderText(/search companies/i);
    await user.type(search, "Brand New Co");
    // Closing the popover with typed text that matches nothing creates it inline.
    await user.keyboard("{Escape}");

    await user.type(
      screen.getByPlaceholderText("https://company.com"),
      "https://brandnew.example",
    );
    await fillRequiredScalarFields(user);
    await user.click(
      screen.getByRole("button", { name: /create application/i }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const payload = submit.mock.calls[0][0];
    expect(payload.company).toEqual({
      name: "Brand New Co",
      url: "https://brandnew.example",
    });
  });

  it("keeps a name-only company as free text (company_id null, AC16)", async () => {
    const user = userEvent.setup();
    render(
      <ApplicationFormSheet open onOpenChange={() => {}} application={null} />,
    );

    await user.click(screen.getByText("Search companies…"));
    await user.type(
      screen.getByPlaceholderText(/search companies/i),
      "Just A Name",
    );
    await user.keyboard("{Escape}");

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
    expect(submit).not.toHaveBeenCalled();
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
