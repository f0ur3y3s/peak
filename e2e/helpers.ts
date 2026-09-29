import { expect, type Page } from "@playwright/test";

/** The page, plus the handful of moves every workout test repeats. */
export function peak(page: Page) {
  const btn = (name: string | RegExp, exact = false) => page.getByRole("button", { name, exact });
  return {
    btn,
    reps: () => page.getByLabel("Reps", { exact: true }),
    weight: () => page.getByLabel(/^Weight/),
    logButton: () => page.getByRole("button", { name: /^Log Set \d/ }),
    header: () => page.locator(".sticky.top-0").first(),

    async open() {
      await page.goto("/");
      await expect(page.locator(".nav-bar")).toBeVisible();
    },
    async tab(name: "Train" | "Plan" | "History" | "You") {
      await page.locator(".nav-tab", { hasText: name }).click();
    },
    async startPushA() {
      await this.open();
      await btn("Start Push A").click();
      await expect(this.header()).toContainText("Push A");
    },
    async logSet() {
      await this.logButton().click();
    },
    async skipRest() {
      const skip = page.locator(".rest-bar").getByRole("button", { name: "Skip rest" });
      if (await skip.count()) await skip.click();
    },
    async finishAndSave() {
      await btn("Finish").click();
      await btn("Done").first().click();
    },
  };
}

/** Collects uncaught errors and console errors, minus the sandbox's font proxy noise. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/fonts\.g|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL/.test(m.text())) {
      errors.push(m.text());
    }
  });
  return errors;
}

import { test as base } from "@playwright/test";

/** `app` drives Peak; any page error during the test fails it. */
export const test = base.extend<{ app: ReturnType<typeof peak> }>({
  app: async ({ page }, use) => {
    const errors = watchErrors(page);
    await use(peak(page));
    expect(errors, "page errors").toEqual([]);
  },
});
export { expect };
