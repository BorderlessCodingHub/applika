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

  it("confirming a URL creates the company and selects the returned id", async () => {
    createCompanyMock.mockResolvedValue({
      id: "co-9",
      name: "Brand New Co",
      url: "https://brandnew.example",
      is_public: false,
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
  });
});
