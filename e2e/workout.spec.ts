import { test, expect } from "./helpers";

test("starts Push A from the Train screen", async ({ app }) => {
  await app.startPushA();
  await expect(app.header()).toContainText("0/20 sets");
  await expect(app.btn("Log Set 1")).toBeVisible();
});

test("pre-fills each set with the one just logged", async ({ app }) => {
  await app.startPushA();
  await app.reps().fill("8");
  await app.weight().fill("62.5");
  await app.logSet();
  await app.skipRest();
  await expect(app.reps()).toHaveValue("8");
  await expect(app.weight()).toHaveValue("62.5");

  await app.reps().fill("7");
  await app.logSet();
  await app.skipRest();
  await expect(app.reps()).toHaveValue("7");
  await expect(app.header()).toContainText("2/20 sets");
});

test("deletes a logged set", async ({ app, page }) => {
  await app.startPushA();
  await app.logSet();
  await app.skipRest();
  await app.logSet();
  await app.skipRest();
  await app.btn("Delete set 2").click();
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) await dialog.getByRole("button", { name: /Delete/ }).click();
  await expect(app.header()).toContainText("1/20 sets");
});

test.describe("weight entry", () => {
  test("a blank weight can't be logged as 0 kg", async ({ app }) => {
    await app.startPushA();
    await app.weight().fill("");
    await expect(app.logButton()).toBeDisabled();
  });

  test("a comma decimal logs the right weight", async ({ app, page }) => {
    await app.startPushA();
    await app.reps().fill("5");
    await app.weight().fill("62,5");
    await expect(app.logButton()).toBeEnabled();
    await app.logSet();
    await expect(page.locator(".card-active")).toContainText("5 × 62.5 kg");
  });

  test("the stepper doesn't show float noise", async ({ app }) => {
    await app.startPushA();
    await app.weight().fill("32.2");
    await app.btn("Decrease Weight (kg)").click();
    await expect(app.weight()).toHaveValue("31.7");
  });
});

test("rest bar appears after a set and Skip removes it", async ({ app, page }) => {
  await app.startPushA();
  await app.logSet();
  await expect(page.locator(".rest-bar")).toBeVisible();
  await page.locator(".rest-bar").getByRole("button", { name: "Skip rest" }).click();
  await expect(page.locator(".rest-bar")).toHaveCount(0);
});

test("Do later moves on to the next exercise", async ({ app, page }) => {
  await app.startPushA();
  await app.btn("Do later").click();
  const activeCard = page.locator(".card-active");
  await expect(activeCard).not.toContainText("Barbell Bench Press");
  await expect(activeCard).toContainText("Incline Dumbbell Press");
});

test.describe("adding an exercise mid-workout", () => {
  async function pickFacePull(app: ReturnType<typeof import("./helpers").peak>, page: import("@playwright/test").Page) {
    await app.startPushA();
    await app.btn("+ Add exercise").click();
    await page.getByRole("button", { name: /^Face Pull/ }).click();
    return page.getByRole("dialog").getByRole("button", { name: /Add|Save/ }).last();
  }

  test("adds it", async ({ app, page }) => {
    const save = await pickFacePull(app, page);
    await save.click();
    await expect(page.getByText("Face Pull", { exact: true })).toHaveCount(1);
  });

  test("a double tap on Save adds it once", async ({ app, page }) => {
    const save = await pickFacePull(app, page);
    await save.dblclick();
    await page.waitForTimeout(500);
    await expect(page.getByText("Face Pull", { exact: true })).toHaveCount(1);
  });
});

test("Finish saves the workout to History with its volume", async ({ app, page }) => {
  await app.startPushA();
  await app.reps().fill("6");
  await app.weight().fill("80");
  await app.logSet();
  await app.skipRest();
  await app.btn("Finish").click();
  await expect(page.locator("body")).toContainText(/Complete/i);
  await expect(page.locator("body")).toContainText("480");
  await app.btn("Done").first().click();
  await app.tab("History");
  await expect(page.getByText("Push A").first()).toBeVisible();
});

test("after a reload, the workout resumes on the first unfinished exercise", async ({ app, page }) => {
  await app.startPushA();
  for (let i = 0; i < 4; i++) {
    await app.logSet(); // Barbell Bench Press is 4 sets
    await app.skipRest();
  }
  await page.reload();
  await expect(app.header()).toContainText("4/20 sets");
  await expect(page.locator(".card-active")).toContainText("Incline Dumbbell Press");
  await expect(app.logButton()).toBeVisible();
});

test("starting another session from Plan doesn't replace the one in progress", async ({ app, page }) => {
  await app.startPushA();
  await app.logSet();
  await app.skipRest();
  await app.tab("Plan");
  await page.getByRole("button", { name: "Start", exact: true }).nth(1).click(); // Pull A
  await expect(page.getByRole("alert")).toContainText("Finish or discard your Push A workout first.");
  await app.tab("Train");
  await expect(app.header()).toContainText("Push A");
  await expect(app.header()).toContainText("1/20 sets");
});
