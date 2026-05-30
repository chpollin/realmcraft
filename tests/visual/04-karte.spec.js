// tests/visual/04-karte.spec.js
// Visual-Snapshot der View "Karte" (Kartengrafik wird maskiert).
import { test, expect } from "@playwright/test";
import {
  openApp,
  loadFixture,
  gotoView,
  maskRegions,
  SCREENSHOT_OPTS,
} from "./helpers.js";

test.describe("Visual: Karte", () => {
  test("Karte-View entspricht der Baseline", async ({ page }) => {
    await openApp(page);
    await loadFixture(page);
    await gotoView(page, "karte");

    await expect(page).toHaveScreenshot("karte.png", {
      ...SCREENSHOT_OPTS,
      mask: maskRegions(page),
    });
  });
});
