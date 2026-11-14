import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { PHONE_QUERY, useIsPhone } from "./use-is-phone";
import { mockPhoneViewport } from "@/test/phone";

describe("useIsPhone", () => {
  it("asks for below md, so 768px itself is desktop", () => {
    expect(PHONE_QUERY).toBe("(max-width: 47.99rem)");
  });

  it("is false at md and up (the setup's matchMedia answers false)", () => {
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
  });

  it("is true below md", () => {
    mockPhoneViewport();
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(true);
  });

  it("follows a rotation across md, both ways", () => {
    const viewport = mockPhoneViewport();
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(true);

    viewport.setPhone(false);
    expect(result.current).toBe(false);

    viewport.setPhone(true);
    expect(result.current).toBe(true);
  });

  it("renders the desktop on the server, whatever the client's width", () => {
    mockPhoneViewport();
    function Probe() {
      return createElement("span", null, String(useIsPhone()));
    }
    expect(renderToString(createElement(Probe))).toContain("false");
  });
});
