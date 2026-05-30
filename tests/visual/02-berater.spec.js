// tests/visual/02-berater.spec.js
// Visual-Snapshot der View "Berater" (Portraits werden maskiert).
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Berater", () => {
  test("Berater-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "berater");

    await expect(page).toHaveScreenshot("berater.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
