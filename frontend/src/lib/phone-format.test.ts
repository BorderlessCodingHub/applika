import { describe, expect, it } from "vitest";

import { displayName, initials } from "./phone-format";

describe("initials", () => {
  it("takes the first letters of the first and last name", () => {
    expect(
      initials({ username: "scarter", first_name: "Sam", last_name: "Carter" }),
    ).toBe("SC");
  });

  it("uppercases them", () => {
    expect(
      initials({ username: "x", first_name: "ada", last_name: "lovelace" }),
    ).toBe("AL");
  });

  it("falls back to the username without a first name", () => {
    expect(initials({ username: "octocat", last_name: "Cat" })).toBe("OC");
  });

  it("falls back to the username without a last name, as the desktop avatar", () => {
    expect(initials({ username: "octocat", first_name: "Ada" })).toBe("OC");
  });

  it("treats blank names as missing", () => {
    expect(
      initials({ username: "dev", first_name: "  ", last_name: " " }),
    ).toBe("DE");
  });

  it("keeps a one-letter username", () => {
    expect(initials({ username: "q" })).toBe("Q");
  });
});

describe("displayName", () => {
  it("joins the first and last name", () => {
    expect(
      displayName({
        username: "scarter",
        first_name: "Sam",
        last_name: "Carter",
      }),
    ).toBe("Sam Carter");
  });

  it("shows the first name alone when there is no last name", () => {
    expect(displayName({ username: "scarter", first_name: "Sam" })).toBe("Sam");
  });

  it("uses the username when there is no first name", () => {
    expect(displayName({ username: "octocat", last_name: "Cat" })).toBe(
      "octocat",
    );
  });

  it("trims the names", () => {
    expect(
      displayName({ username: "x", first_name: " Sam ", last_name: "  " }),
    ).toBe("Sam");
  });

  it("treats a blank first name as missing", () => {
    expect(displayName({ username: "octocat", first_name: "   " })).toBe(
      "octocat",
    );
  });
});
