// tests/visual/05-historie.spec.js
// Visual-Snapshot der View "Historie".
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Historie", () => {
  test("Historie-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "historie");

    await expect(page).toHaveScreenshot("historie.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
