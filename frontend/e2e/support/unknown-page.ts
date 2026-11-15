import { expect, type Page } from "@playwright/test";

/**
 * What the web answers at an address no page owns. The static export is
 * served by `docker/nginx.conf`, whose `try_files $uri $uri.html $uri/
 * /index.html` answers every unknown address with the home page's document
 * (200) at the address asked for. A deleted page must answer exactly that,
 * with no message, forward or placeholder of its own (ADR-0028).
 */
interface Answer {
  status: number | undefined;
  pathname: string;
  title: string;
  headings: string[];
}

function withoutClosingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

async function answerAt(page: Page, path: string): Promise<Answer> {
  const response = await page.goto(path);
  // Every heading the viewport shows (the home page's desktop tree has no h1).
  const heading = page.getByRole("heading");
  await expect(heading.first()).toBeVisible();
  return {
    status: response?.status(),
    pathname: withoutClosingSlash(new URL(page.url()).pathname),
    title: await page.title(),
    headings: await heading.allTextContents(),
  };
}

/** `path` answers like an address no page ever owned, and stays where it is. */
export async function expectAnswersLikeAnUnknownPage(page: Page, path: string) {
  const nowhere = `/e2e-unknown-${Date.now().toString(36)}`;
  const unknown = await answerAt(page, nowhere);
  const answer = await answerAt(page, path);

  expect(answer.pathname, `${path} stays at its address`).toBe(
    withoutClosingSlash(new URL(path, "http://x").pathname),
  );
  expect(
    { ...answer, pathname: nowhere },
    `${path} answers like ${nowhere}`,
  ).toEqual(unknown);
}
