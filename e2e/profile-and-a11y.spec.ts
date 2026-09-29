import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./helpers";

test("switching to lb converts the log form and logged sets", async ({ app, page }) => {
  await app.open();
  await app.tab("You");
  await app.btn("lb", true).click();
  await app.tab("Train");
  await app.btn("Start Push A").click();
  await expect(page.getByRole("textbox", { name: "Weight (lb)" })).toBeVisible();
  await app.weight().fill("135");
  await app.logSet();
  await expect(page.locator(".card-active")).toContainText("135 lb");
});

test("no serious or critical axe violations on the main screens", async ({ app, page }) => {
  await app.open();
  const screens: [string, () => Promise<void>][] = [
    ["Train", async () => {}],
    ["Plan", () => app.tab("Plan")],
    ["History", () => app.tab("History")],
    ["You", () => app.tab("You")],
    ["Workout", async () => {
      await app.tab("Train");
      await app.btn("Start Push A").click();
      await app.logSet();
    }],
  ];
  const found: string[] = [];
  for (const [name, go] of screens) {
    await go();
    await page.waitForTimeout(300);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
      found.push(`${name}: ${v.id} ×${v.nodes.length}`);
    }
  }
  expect(found).toEqual([]);
});
