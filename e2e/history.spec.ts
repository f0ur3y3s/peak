import { test, expect } from "./helpers";

test.beforeEach(async ({ app }) => {
  await app.startPushA();
  await app.reps().fill("6");
  await app.weight().fill("80");
  await app.logSet();
  await app.skipRest();
  await app.finishAndSave();
  await app.tab("History");
});

test("the progress chart renders and switches range and metric", async ({ page }) => {
  await page.getByRole("tab", { name: "Progress" }).click();
  await expect(page.locator("svg").first()).toBeVisible();
  for (const b of await page.locator("button").filter({ hasText: /^(Volume|Peak|1M|3M|All)$/ }).all()) await b.click();
});

test("a workout opens with the keyboard, and can be deleted", async ({ page }) => {
  const row = page.getByRole("button", { name: /Push A/ });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: /Delete (this )?workout|Delete session/i }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).last().click();
  await expect(page.getByText("Push A")).toHaveCount(0);
});
