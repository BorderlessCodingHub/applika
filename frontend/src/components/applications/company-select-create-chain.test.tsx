import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompanySelect } from "@/components/applications/company-select";
import { api } from "@/lib/api-client";

/**
 * KODI-035 remediation r1 (QA F1): `company-select.test.tsx` mocks
 * `useCreateCompany` itself, so it never exercises the line that actually
 * reads the HTTP status (`CompanyService.create`, `r.status === 201`). This
 * file mocks nothing above axios: the REAL `useCreateCompany` hook and the
 * REAL `CompanyService` run, and only `api.post` is stubbed with a status
 * code — proving the 200-vs-201 branch itself, not just the picker's
 * reaction to a pre-shaped `{status: "reused" | "created"}` outcome.
 */

function renderReal() {
  const setValue = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CompanySelect
        form={{ setValue, formState: { errors: {} } }}
        value={null}
        fetchCompanies={vi.fn().mockResolvedValue([])}
      />
    </QueryClientProvider>,
  );
  return { setValue };
}

async function addWithUrl(name: string, url: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox"));
  await user.type(
    screen.getByPlaceholderText(/search or add a company/i),
    name,
  );
  await user.click(await screen.findByText(`Create "${name}"`));
  await user.type(screen.getByLabelText(/^url/i), url);
  await user.click(screen.getByRole("button", { name: /^add company$/i }));
}

afterEach(() => vi.restoreAllMocks());

describe("CompanySelect + the real create chain: POST /companies status reaches the notice", () => {
  it("a 200 (reused, R-021) shows the already-in-your-list notice and selects the returned id", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({
      status: 200,
      data: {
        id: "co-1",
        name: "Acme Inc",
        url: "https://acme.example",
        is_public: true,
      },
    });
    const { setValue } = renderReal();

    await addWithUrl("Acme Inc", "https://acme.example");

    await waitFor(() =>
      expect(setValue).toHaveBeenCalledWith("company", "co-1", {
        shouldValidate: true,
      }),
    );
    expect(post).toHaveBeenCalledWith("/companies", {
      name: "Acme Inc",
      url: "https://acme.example",
    });
    const notice = document.querySelector(
      '[data-slot="catalog-select-notice"]',
    );
    expect(notice).toHaveTextContent(
      "Acme Inc is already in your list. It is now selected.",
    );
  });

  it("a 201 (new) shows no reuse notice and selects the returned id", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      status: 201,
      data: {
        id: "co-9",
        name: "New Co",
        url: "https://new.example",
        is_public: false,
      },
    });
    const { setValue } = renderReal();

    await addWithUrl("New Co", "https://new.example");

    await waitFor(() =>
      expect(setValue).toHaveBeenCalledWith("company", "co-9", {
        shouldValidate: true,
      }),
    );
    const notice = document.querySelector(
      '[data-slot="catalog-select-notice"]',
    );
    expect(notice?.textContent ?? "").toBe("");
    expect(screen.getByRole("combobox")).toHaveTextContent("Only you");
  });
});
