import { test, expect } from "./helpers";

test("creates a session template", async ({ app, page }) => {
  await app.open();
  await app.tab("Plan");
  await app.btn("+ New session").click();
  await page.locator("input").first().fill("Arms Day");
  await app.btn("Create", true).click();
  await expect(page.getByText("Arms Day").first()).toBeVisible();
  await app.tab("Plan");
  await expect(page.getByText("Arms Day").first()).toBeVisible();
});

test("a rename after reordering keeps the new order", async ({ app, page }) => {
  await app.open();
  await app.tab("Plan");
  await page.getByText("Pull A", { exact: true }).first().click();
  await app.btn("Edit template").click();
  const names = () => page.locator("p.font-semibold");
  const second = await names().nth(1).innerText();
  await page.getByRole("button", { name: /Move .* down/ }).first().click();
  await expect(names().first()).toHaveText(second);

  const name = page.locator('input[value="Pull A"]').first();
  await name.fill("Pull A (heavy)");
  await name.blur();
  await page.waitForTimeout(300);
  await page.reload();
  await app.tab("Plan");
  await page.getByText("Pull A (heavy)", { exact: true }).first().click();
  await expect(names().first()).toHaveText(second);
});

test("creates, finds and deletes a library exercise", async ({ app, page }) => {
  await app.open();
  await app.tab("Plan");
  await page.getByRole("tab", { name: "Exercises" }).click();
  await app.btn("New exercise").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Zercher Squat");
  await dialog.getByRole("button", { name: /Create|Save/ }).last().click();
  await page.getByPlaceholder("Search exercises").fill("zerch");
  await expect(page.getByText("Zercher Squat")).toBeVisible();
  await app.btn("Delete Zercher Squat").click();
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).last().click();
  await expect(page.getByText("Zercher Squat")).toHaveCount(0);
});
