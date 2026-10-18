import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  apiUrl,
  authCookieHeader,
  loginAs,
  seededUserId,
  type SeededRole,
} from "./auth";

/**
 * Shared helpers for the beta-feature specs (`beta-features.spec.ts` for
 * `jobs`, `cvs-beta.spec.ts` for `cvs`): the admin API calls that put a
 * feature back to its seeded state, the admin screens at
 * `/admin/features/view?key=…`, and the rail a user sees once their features
 * have answered. Everything runs against the real stack.
 */

/** A gated feature's key, as `FeatureKey` has it in the backend. */
export type BetaFeatureKey = "cvs" | "jobs";

export function headers(role: SeededRole) {
  return { Cookie: authCookieHeader(role), "Content-Type": "application/json" };
}

export async function expectOk(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** Moves `feature` to `stage` as the admin. */
export async function setStage(
  request: APIRequestContext,
  feature: BetaFeatureKey,
  stage: "beta" | "general",
) {
  await expectOk(
    await request.patch(apiUrl(`/admin/features/${feature}`), {
      headers: headers("admin"),
      data: { stage },
    }),
  );
}

/** Puts `role` on (`on`) or takes it off the `feature` beta list, as the admin. */
export async function setListed(
  request: APIRequestContext,
  feature: BetaFeatureKey,
  role: SeededRole,
  on: boolean,
) {
  const path = apiUrl(`/admin/features/${feature}/users/${seededUserId(role)}`);
  const response = on
    ? await request.put(path, { headers: headers("admin") })
    : await request.delete(path, { headers: headers("admin") });
  await expectOk(response);
}

/** Deletes the admin's own opt-out of `feature`. */
export async function clearOptOut(
  request: APIRequestContext,
  feature: BetaFeatureKey,
) {
  await expectOk(
    await request.delete(apiUrl(`/admin/features/${feature}/opt-out`), {
      headers: headers("admin"),
    }),
  );
}

/** The seeded state of `feature` back: stage beta, `offList` off its list, no opt-out. */
export async function restoreSeedState(
  request: APIRequestContext,
  feature: BetaFeatureKey,
  offList: readonly SeededRole[],
) {
  await setStage(request, feature, "beta");
  for (const role of offList) {
    await setListed(request, feature, role, false);
  }
  await clearOptOut(request, feature);
}

/** A second, independent browser session for `role`. */
export async function openAs(
  browser: Browser,
  role: SeededRole,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, role);
  return page;
}

export function rail(page: Page): Locator {
  return page.locator("aside").getByRole("navigation", { name: "Primary" });
}

/**
 * Runs `navigate` (a goto or a reload) and waits for its `/users/me/features`
 * answer: the gated entries join the rail only after it, so a rail assertion
 * made earlier could pass against the not-yet-gated nav. Returns the caller's
 * feature keys, sorted.
 */
export async function settleFeatures(
  page: Page,
  navigate: () => Promise<unknown>,
): Promise<string[]> {
  const features = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/users/me/features") &&
      response.request().method() === "GET",
  );
  await navigate();
  const body = (await (await features).json()) as {
    features: Array<{ key: string }>;
  };
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(rail(page)).toBeVisible();
  return body.features.map((feature) => feature.key).sort();
}

export function betaRow(page: Page, username: string): Locator {
  return page.locator(
    `tr[data-slot="feature-beta-user"][data-username="${username}"]`,
  );
}

/** Opens `feature`'s admin page and waits for its heading and the admin's own access. */
export async function openFeaturePage(
  page: Page,
  feature: BetaFeatureKey,
  name: string,
) {
  await page.goto(`/admin/features/view?key=${feature}`);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(
    page.locator('[data-slot="feature-own-access-reason"]'),
  ).toBeVisible();
}

/** Adds `username` through the "Add user" dialog (search by username). */
export async function addByUsername(page: Page, username: string) {
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Add users to the beta list",
  });
  await dialog.getByRole("searchbox", { name: "Search users" }).fill(username);
  await dialog
    .getByRole("button", { name: `Add ${username}`, exact: true })
    .click();
  await expect(
    dialog.locator('[data-slot="feature-add-user-status"]'),
  ).toHaveText(`${username} is on the beta list now.`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(betaRow(page, username)).toBeVisible();
}

/** Removes `username` behind its confirm. */
export async function removeUser(page: Page, username: string) {
  await page
    .getByRole("button", { name: `Remove ${username}`, exact: true })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(`Remove ${username} from the beta list?`);
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(betaRow(page, username)).toHaveCount(0);
}
