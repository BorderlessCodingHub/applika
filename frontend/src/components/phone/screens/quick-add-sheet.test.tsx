import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CycleProvider } from "@/contexts/cycle-context";
import type { User } from "@/services/types/users";
import { routerPush, setLocation } from "@/test/navigation";
import { mockPhoneViewport } from "@/test/phone";
import { PickPastCycle, SAM, ViewedCycle } from "@/test/phone-screens";
import { QuickAddSheet, platformChips } from "./quick-add-sheet";

const mocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
  getApplications: vi.fn(),
  features: [] as { key: string; stage: string }[],
}));

let currentUser: User = SAM;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    applications: {
      createApplication: mocks.createApplication,
      getApplications: mocks.getApplications,
    },
    features: { getMine: () => Promise.resolve(mocks.features) },
    platforms: {
      list: () =>
        Promise.resolve([
          { id: "p-company", name: "Company site", url: null },
          { id: "p-indeed", name: "Indeed", url: null },
          { id: "p-linkedin", name: "LinkedIn", url: null },
          { id: "p-referral", name: "Referral", url: null },
        ]),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Today's company picker is tested on its own (company-select.test.tsx):
// here a plain field that sets the same form value a typed-in name does.
vi.mock("@/components/applications/company-select", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/applications/company-select")
  >("@/components/applications/company-select");
  return {
    ...actual,
    CompanySelect: ({
      id,
      form,
      placeholder,
    }: {
      id?: string;
      placeholder?: string;
      form: {
        setValue: (
          name: "company",
          value: { name: string; url?: string },
          options?: { shouldValidate: boolean },
        ) => void;
      };
    }) => (
      <input
        id={id}
        placeholder={placeholder}
        onChange={(event) =>
          form.setValue(
            "company",
            { name: event.target.value, url: "" },
            { shouldValidate: true },
          )
        }
      />
    ),
  };
});

// Monday 9 November 2026, 10:00.
const NOW = new Date(2026, 10, 9, 10, 0);

function Harness({
  path,
  initiallyOpen,
}: {
  path: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        reopen
      </button>
      <QuickAddSheet open={open} onOpenChange={setOpen} activePath={path} />
    </>
  );
}

function renderSheet({
  path = "/dashboard",
  features = [] as { key: string; stage: string }[],
  open = true,
} = {}) {
  mockPhoneViewport();
  mocks.features = features;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(["user", "features"], features);
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <Harness path={path} initiallyOpen={open} />
        <PickPastCycle />
        <ViewedCycle />
      </CycleProvider>
    </QueryClientProvider>,
  );
}

const sheet = () => screen.getByRole("dialog", { name: "Add application" });

async function fillEssentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Company"), "Northwind Labs");
  await user.type(screen.getByLabelText("Role"), "Senior Backend Engineer");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setLocation("/dashboard");
  currentUser = SAM;
  routerPush.mockReset();
  mocks.createApplication.mockReset().mockResolvedValue({ id: "new-1" });
  mocks.getApplications.mockReset().mockResolvedValue([
    { id: "a", platform_id: "p-linkedin" },
    { id: "b", platform_id: "p-linkedin" },
    { id: "c", platform_id: "p-referral" },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("QuickAddSheet", () => {
  it("asks for the essentials: company, role, where and when", async () => {
    renderSheet();

    expect(sheet()).toHaveAccessibleDescription(
      "Just the essentials — you can add the rest later.",
    );
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    const where = screen.getByRole("radiogroup", {
      name: "Where did you apply?",
    });
    // The platforms the user applies through most come first, then by name.
    await waitFor(() =>
      expect(
        within(where)
          .getAllByRole("radio")
          .map((radio) => radio.textContent),
      ).toEqual(["LinkedIn", "Referral", "Company site", "Other"]),
    );
    expect(
      within(where).getByRole("radio", { name: "LinkedIn" }),
    ).toBeChecked();
    const when = screen.getByRole("radiogroup", { name: "Applied on" });
    expect(
      within(when)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Today", "Yesterday", "Pick a date"]);
    expect(within(when).getByRole("radio", { name: "Today" })).toBeChecked();
  });

  it("keeps the link, work mode and salary behind More details", async () => {
    const user = userEvent.setup();
    renderSheet();

    const more = screen.getByRole("button", { name: "More details" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAccessibleDescription("Link, work mode, salary");
    expect(screen.getByLabelText("Job posting link")).not.toBeVisible();

    await user.click(more);
    expect(screen.getByLabelText("Job posting link")).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "Work mode" })).toBeVisible();
    expect(screen.getByLabelText("Salary from")).toBeVisible();
    expect(screen.getByLabelText("Salary to")).toBeVisible();
  });

  it("adds it to the pipeline, mode active, dated today, and opens it", async () => {
    const user = userEvent.setup();
    renderSheet();
    await fillEssentials(user);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "LinkedIn" })).toBeChecked(),
    );

    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    await waitFor(() =>
      expect(mocks.createApplication).toHaveBeenCalledWith({
        company: { name: "Northwind Labs", url: null },
        platform_id: "p-linkedin",
        role: "Senior Backend Engineer",
        mode: "active",
        application_date: "2026-11-09",
        link_to_job: undefined,
        work_mode: undefined,
        currency: undefined,
        salary_period: undefined,
        salary_range_min: undefined,
        salary_range_max: undefined,
      }),
    );
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/applications?focus=new-1"),
    );
    expect(
      screen.queryByRole("dialog", { name: "Add application" }),
    ).not.toBeInTheDocument();
  });

  it("opens it in place on the Pipeline, on the current cycle", async () => {
    const user = userEvent.setup();
    setLocation("/applications");
    renderSheet({ path: "/applications", open: false });
    await user.click(screen.getByRole("button", { name: "pick past cycle" }));
    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c2");
    await user.click(screen.getByRole("button", { name: "reopen" }));
    await fillEssentials(user);

    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    await waitFor(() => expect(window.location.search).toBe("?focus=new-1"));
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("current");
  });

  it("dates it yesterday, as a local calendar day", async () => {
    const user = userEvent.setup();
    renderSheet();
    await fillEssentials(user);
    await user.click(screen.getByRole("radio", { name: "Yesterday" }));
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    await waitFor(() =>
      expect(mocks.createApplication).toHaveBeenCalledWith(
        expect.objectContaining({ application_date: "2026-11-08" }),
      ),
    );
  });

  it("asks for a picked date through today's date picker, named Applied on", async () => {
    const user = userEvent.setup();
    renderSheet();
    await fillEssentials(user);
    await user.click(screen.getByRole("radio", { name: "Pick a date" }));

    const trigger = screen.getByRole("button", { name: "Applied on" });
    expect(trigger).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));
    expect(
      await screen.findByText("Application date is required"),
    ).toBeInTheDocument();
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("says what is missing and creates nothing", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    expect(await screen.findByText("Role is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("picks another platform through today's picker under Other", async () => {
    const user = userEvent.setup();
    renderSheet();
    await fillEssentials(user);
    await user.click(await screen.findByRole("radio", { name: "Other" }));

    expect(
      screen.getByRole("combobox", { name: "Where did you apply?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));
    expect(await screen.findByText("Platform is required")).toBeInTheDocument();
  });

  it("sends the salary in the profile's currency and period", async () => {
    const user = userEvent.setup();
    currentUser = { ...SAM, salary_currency: "EUR", salary_period: "annually" };
    renderSheet();
    await fillEssentials(user);
    await user.click(screen.getByRole("button", { name: "More details" }));
    await user.type(screen.getByLabelText("Salary from"), "60,000");
    await user.type(screen.getByLabelText("Salary to"), "75000");
    await user.click(screen.getByRole("radio", { name: "Remote" }));
    await user.type(
      screen.getByLabelText("Job posting link"),
      "https://jobs.example.com/1",
    );
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    await waitFor(() =>
      expect(mocks.createApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "EUR",
          salary_period: "annually",
          salary_range_min: 60000,
          salary_range_max: 75000,
          work_mode: "remote",
          link_to_job: "https://jobs.example.com/1",
        }),
      ),
    );
  });

  it("refuses a salary without the profile's currency and period, and opens More details for it", async () => {
    const user = userEvent.setup();
    renderSheet();
    await fillEssentials(user);
    await user.click(screen.getByRole("button", { name: "More details" }));
    await user.type(screen.getByLabelText("Salary from"), "60000");
    await user.click(screen.getByRole("button", { name: "More details" }));
    await user.click(screen.getByRole("button", { name: "Add to pipeline" }));

    expect(
      await screen.findByText(
        "Set your salary currency and period in your profile first, or leave the salary empty",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "More details" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it("offers Start with a CV instead only with cvs", async () => {
    const { unmount } = renderSheet();
    expect(
      screen.queryByRole("link", { name: "Start with a CV instead" }),
    ).not.toBeInTheDocument();
    unmount();

    renderSheet({ features: [{ key: "cvs", stage: "beta" }] });
    expect(
      screen.getByRole("link", { name: "Start with a CV instead" }),
    ).toHaveAttribute("href", "/applications/new-with-cv");
  });
});

describe("platformChips", () => {
  const options = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];

  it("takes the three most used, then the rest in order", () => {
    expect(
      platformChips(options, [
        { platform_id: "d" },
        { platform_id: "d" },
        { platform_id: "c" },
      ]).map((chip) => chip.id),
    ).toEqual(["d", "c", "a"]);
    expect(platformChips(options, []).map((chip) => chip.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
