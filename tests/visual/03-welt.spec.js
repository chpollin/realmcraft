// tests/visual/03-welt.spec.js
// Visual-Snapshot der View "Welt".
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Welt", () => {
  test("Welt-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "welt");

    await expect(page).toHaveScreenshot("welt.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
