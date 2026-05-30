// tests/visual/01-lage.spec.js
// Visual-Snapshot der View "Lage" (Start-/Uebersichts-View).
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Lage", () => {
  test("Lage-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "lage");

    await expect(page).toHaveScreenshot("lage.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
