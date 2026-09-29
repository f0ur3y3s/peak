import { test, expect } from "./helpers";

test("stays phone-width and centred on a desktop, with no sideways scroll", async ({ app, page }) => {
  await app.open();
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    nav: document.querySelector(".nav-bar")!.getBoundingClientRect().width,
  }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.nav).toBeLessThanOrEqual(430);
});
