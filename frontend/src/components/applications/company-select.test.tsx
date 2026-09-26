import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CompanySelect } from "@/components/applications/company-select";

/** KODI-035 (T108): the company field, on `CatalogSelect`, same as platform. */

const setValue = vi.fn();
const createCompanyMock = vi.fn();

vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: createCompanyMock }),
}));

const form = {
  setValue,
  formState: { errors: {} },
};

function setup(fetchCompanies = vi.fn().mockResolvedValue([])) {
  const onCompanyChange = vi.fn();
  render(
    <CompanySelect
      form={form}
      value={null}
      fetchCompanies={fetchCompanies}
      onCompanyChange={onCompanyChange}
    />,
  );
  return { onCompanyChange, fetchCompanies };
}

beforeEach(() => {
  setValue.mockClear();
  createCompanyMock.mockClear();
});

describe("CompanySelect", () => {
  it("lists the visible companies on open, including a private one (KODI-035, AC1 (b))", async () => {
    const fetchCompanies = vi.fn().mockResolvedValue([
      {
        id: "co-1",
        name: "Acme Inc",
        url: "https://acme.example",
        is_public: true,
      },
      { id: "co-2", name: "Secret Co", url: null, is_public: false },
    ]);
    const user = userEvent.setup();
    setup(fetchCompanies);

    // A blank query, not just a typed one — the list shows before any typing.
    await waitFor(() => expect(fetchCompanies).toHaveBeenCalledWith(""));
    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    const privateRow = (await screen.findByText("Secret Co")).closest(
      '[role="option"]',
    ) as HTMLElement;
    expect(privateRow).toHaveTextContent("Only you");
  });

  it("narrows the open list as the user types", async () => {
    const fetchCompanies = vi.fn().mockImplementation((query: string) => {
      const all = [
        {
          id: "co-1",
          name: "Acme Inc",
          url: "https://acme.example",
          is_public: true,
        },
        { id: "co-2", name: "Beta LLC", url: null, is_public: true },
      ];
      const q = query.trim().toLowerCase();
      return Promise.resolve(
        q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all,
      );
    });
    const user = userEvent.setup();
    setup(fetchCompanies);

    await waitFor(() => expect(fetchCompanies).toHaveBeenCalledWith(""));
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    expect(await screen.findByText("Beta LLC")).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await waitFor(() => expect(fetchCompanies).toHaveBeenCalledWith("Acme"));
    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    expect(screen.queryByText("Beta LLC")).not.toBeInTheDocument();
  });

  it("selecting from the list opened with no search still works", async () => {
    const fetchCompanies = vi
      .fn()
      .mockResolvedValue([
        { id: "co-1", name: "Acme Inc", url: null, is_public: true },
      ]);
    const user = userEvent.setup();
    setup(fetchCompanies);

    await waitFor(() => expect(fetchCompanies).toHaveBeenCalledWith(""));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Acme Inc"));

    expect(setValue).toHaveBeenCalledWith("company", "co-1", {
      shouldValidate: true,
    });
  });

  it("searches and selects an existing company", async () => {
    const fetchCompanies = vi.fn().mockResolvedValue([
      {
        id: "co-1",
        name: "Acme Inc",
        url: "https://acme.example",
        is_public: true,
      },
    ]);
    const user = userEvent.setup();
    setup(fetchCompanies);

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await waitFor(() => expect(fetchCompanies).toHaveBeenCalledWith("Acme"));
    await user.click(await screen.findByText("Acme Inc"));

    expect(setValue).toHaveBeenCalledWith("company", "co-1", {
      shouldValidate: true,
    });
  });

  it("marks a private company Only you", async () => {
    const fetchCompanies = vi
      .fn()
      .mockResolvedValue([
        { id: "co-2", name: "Secret Co", url: null, is_public: false },
      ]);
    const user = userEvent.setup();
    setup(fetchCompanies);

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Secret",
    );
    const row = (await screen.findByText("Secret Co")).closest(
      '[role="option"]',
    ) as HTMLElement;
    expect(row).toHaveTextContent("Only you");
  });

  it("a listed exact match still offers Create", async () => {
    const fetchCompanies = vi
      .fn()
      .mockResolvedValue([
        { id: "co-1", name: "Acme Inc", url: null, is_public: true },
      ]);
    const user = userEvent.setup();
    setup(fetchCompanies);

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme Inc",
    );
    expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
    expect(await screen.findByText('Create "Acme Inc"')).toBeInTheDocument();
  });

  it("confirming a URL creates the company and selects the returned id (201, no notice)", async () => {
    createCompanyMock.mockResolvedValue({
      company: {
        id: "co-9",
        name: "Brand New Co",
        url: "https://brandnew.example",
        is_public: false,
      },
      created: true,
    });
    const user = userEvent.setup();
    const { onCompanyChange } = setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Brand New Co",
    );
    await user.click(await screen.findByText('Create "Brand New Co"'));
    await user.type(screen.getByLabelText(/^url/i), "https://brandnew.example");
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    await waitFor(() =>
      expect(createCompanyMock).toHaveBeenCalledWith({
        name: "Brand New Co",
        url: "https://brandnew.example",
      }),
    );
    expect(setValue).toHaveBeenCalledWith("company", "co-9", {
      shouldValidate: true,
    });
    expect(onCompanyChange).toHaveBeenCalledWith({
      id: "co-9",
      name: "Brand New Co",
      url: "https://brandnew.example",
    });
    expect(
      screen.queryByText(/is already in your list/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Only you");
  });

  it("confirming a URL that matches an existing row reuses it and shows the notice (200, R-021)", async () => {
    createCompanyMock.mockResolvedValue({
      company: {
        id: "co-1",
        name: "Acme Inc",
        url: "https://acme.example",
        is_public: true,
      },
      created: false,
    });
    const user = userEvent.setup();
    const { onCompanyChange } = setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme Inc",
    );
    await user.click(await screen.findByText('Create "Acme Inc"'));
    await user.type(screen.getByLabelText(/^url/i), "https://acme.example");
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    await waitFor(() =>
      expect(setValue).toHaveBeenCalledWith("company", "co-1", {
        shouldValidate: true,
      }),
    );
    expect(onCompanyChange).toHaveBeenCalledWith({
      id: "co-1",
      name: "Acme Inc",
      url: "https://acme.example",
    });
    const notice = await screen.findByText("Acme Inc is already in your list.");
    expect(
      notice.closest('[data-slot="catalog-select-notice"]'),
    ).toHaveTextContent(
      "Acme Inc is already in your list. It is now selected.",
    );
  });

  it("confirming with no URL keeps the name as free text (R-019)", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Just A Name",
    );
    await user.click(await screen.findByText('Create "Just A Name"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));

    expect(createCompanyMock).not.toHaveBeenCalled();
    // `shouldValidate: true` (QA round 1 B1): picking a valid free-text
    // company after a failed submit must clear a stale "Company is
    // required" error, not just silently accept the new value.
    expect(setValue).toHaveBeenCalledWith(
      "company",
      { name: "Just A Name", url: "" },
      { shouldValidate: true },
    );
    // QA F3: the free-text notice must be shown, WITHOUT the "now selected"
    // suffix — a free-text pick has no id to have been "selected" from a list.
    const notice = await screen.findByText(
      "Just A Name is kept on this application only.",
    );
    expect(
      notice.closest('[data-slot="catalog-select-notice"]'),
    ).toHaveTextContent("Just A Name is kept on this application only.");
    expect(screen.queryByText(/it is now selected/i)).not.toBeInTheDocument();
  });
});
