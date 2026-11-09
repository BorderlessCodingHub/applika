import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  PhoneLoadable,
  PhoneSkeleton,
  PhoneSkeletonCard,
  type PhoneLoad,
} from "./phone-load";
import { bothLoad, fromQuery, mapLoad } from "./phone-query-load";

const loading = (
  <PhoneSkeleton label="Loading applications">
    <PhoneSkeletonCard className="h-10" />
  </PhoneSkeleton>
);

describe("PhoneLoadable", () => {
  it("shows the board's shapes while loading, said once for assistive tech", () => {
    render(
      <PhoneLoadable state={{ status: "loading" }} loading={loading}>
        {() => <p>ready</p>}
      </PhoneLoadable>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading applications");
    expect(screen.queryByText("ready")).not.toBeInTheDocument();
  });

  it("renders the data once ready", () => {
    render(
      <PhoneLoadable
        state={{ status: "ready", data: { count: 3 } }}
        loading={loading}
      >
        {(data) => <p>{`count ${data.count}`}</p>}
      </PhoneLoadable>,
    );
    expect(screen.getByText("count 3")).toBeInTheDocument();
  });

  it("says what failed and retries, keeping the button focusable while it runs", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <PhoneLoadable
        state={{ status: "error", message: "Server down", onRetry }}
        loading={loading}
      >
        {() => <p>ready</p>}
      </PhoneLoadable>,
    );

    expect(screen.getByText("Server down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <PhoneLoadable
        state={{
          status: "error",
          message: "Server down",
          onRetry,
          retrying: true,
        }}
        loading={loading}
      >
        {() => <p>ready</p>}
      </PhoneLoadable>,
    );
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toHaveAttribute("aria-disabled", "true");
    expect(retry).toHaveAttribute("aria-busy", "true");
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("takes focus back on the region when a retry succeeds", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [state, setState] = useState<PhoneLoad<string>>({
        status: "error",
        message: "Server down",
        onRetry: () => setState({ status: "ready", data: "back" }),
      });
      return (
        <PhoneLoadable state={state} loading={loading}>
          {(data) => <p>{data}</p>}
        </PhoneLoadable>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("back")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="phone-loadable"]'),
      ).toHaveFocus(),
    );
  });
});

describe("phone query loads", () => {
  const query = {
    data: undefined as number | undefined,
    isError: false,
    error: null as unknown,
    isFetching: false,
    refetch: vi.fn(),
  };

  it("is loading without data, ready with it, an error with the API's words", () => {
    expect(fromQuery(query)).toEqual({ status: "loading" });
    expect(fromQuery({ ...query, data: 0 })).toEqual({
      status: "ready",
      data: 0,
    });
    const failed = fromQuery({
      ...query,
      isError: true,
      error: { response: { data: { detail: "Too many requests" } } },
      isFetching: true,
    });
    expect(failed).toMatchObject({
      status: "error",
      message: "Too many requests",
      retrying: true,
    });
    if (failed.status === "error") failed.onRetry();
    expect(query.refetch).toHaveBeenCalled();
  });

  it("maps and joins loads, the first error winning", () => {
    const ready = { status: "ready" as const, data: 2 };
    const error = {
      status: "error" as const,
      message: "down",
      onRetry: vi.fn(),
    };
    expect(mapLoad(ready, (n) => n * 2)).toEqual({ status: "ready", data: 4 });
    expect(bothLoad(ready, { status: "ready", data: "x" })).toEqual({
      status: "ready",
      data: [2, "x"],
    });
    expect(bothLoad(ready, { status: "loading" })).toEqual({
      status: "loading",
    });
    expect(bothLoad({ status: "loading" }, error)).toBe(error);
  });
});
