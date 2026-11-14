import { afterEach, describe, expect, it } from "vitest";

import {
  RETURN_TO_KEY,
  consumeReturnTo,
  isSafeReturnTo,
  remembersReturnTo,
  storeReturnTo,
} from "./return-to";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("remembersReturnTo", () => {
  it.each(["/device", "/device/", "/profile", "/profile/"])(
    "keeps %s through the sign-in round trip",
    (path) => {
      expect(remembersReturnTo(path)).toBe(true);
    },
  );

  it.each(["/dashboard", "/applications", "/profiles", "/admin", "/"])(
    "leaves %s to the dashboard after sign-in",
    (path) => {
      expect(remembersReturnTo(path)).toBe(false);
    },
  );
});

describe("storeReturnTo + consumeReturnTo", () => {
  it("keeps /mcp's Create a token target, query included, once", () => {
    storeReturnTo("/profile?tab=mcp");

    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      "/profile?tab=mcp",
    );
    expect(consumeReturnTo()).toBe("/profile?tab=mcp");
    expect(consumeReturnTo()).toBeNull();
  });

  it.each([
    "//evil.example/profile",
    "/\\evil.example",
    "https://evil.example",
  ])("never stores or returns %s", (target) => {
    storeReturnTo(target);
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();

    window.sessionStorage.setItem(RETURN_TO_KEY, target);
    expect(isSafeReturnTo(target)).toBe(false);
    expect(consumeReturnTo()).toBeNull();
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });
});
