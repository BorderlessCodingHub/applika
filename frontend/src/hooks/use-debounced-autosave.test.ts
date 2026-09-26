import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useDebouncedAutosave } from "@/hooks/use-debounced-autosave";

describe("useDebouncedAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends nothing before 1000ms", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(999));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends exactly one request after 1000ms", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("b");
  });

  it("collapses a burst of changes into one request with the latest value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(400));
    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(400));
    rerender({ value: "d" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("d");
  });

  it("queues a change that lands mid-flight and sends it right after the first resolves", async () => {
    let resolveFirst: (() => void) | undefined;
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          if (!resolveFirst) resolveFirst = resolve;
          else resolve();
        }),
    );
    const { rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("b");

    // A change lands while the first request is still in flight.
    rerender({ value: "c" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // No SECOND request yet — the first has not resolved.
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("c");
  });

  it("keeps the payload on error and retries with the latest value on the next change", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("boom"));
    onSave.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.status).toBe("error");

    rerender({ value: "c" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("c");
    expect(result.current.status).toBe("saved");
  });

  it("Retry sends the latest value immediately, bypassing the debounce", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("boom"));
    onSave.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedAutosave({ value, isReady: true, onSave }),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.status).toBe("error");

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("never sends a request while required fields are empty", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ value, isReady }) => useDebouncedAutosave({ value, isReady, onSave }),
      { initialProps: { value: "a", isReady: false } },
    );

    rerender({ value: "b", isReady: false });
    act(() => vi.advanceTimersByTime(5000));

    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.missingRequired).toBe(true);
  });
});
