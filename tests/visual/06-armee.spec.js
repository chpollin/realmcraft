// tests/visual/06-armee.spec.js
// Visual-Snapshot der View "Armee".
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Armee", () => {
  test("Armee-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "armee");

    await expect(page).toHaveScreenshot("armee.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
