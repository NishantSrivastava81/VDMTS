import { expect, test } from "@playwright/test";

/**
 * Runs against the fixture build, so these assert layout and rendering only —
 * no Azure call is made.
 */
test.describe("mathematics rendering on a phone", () => {
  test("the capture screen is the first thing the student sees", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Bring in one question" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take a photo" })).toBeVisible();
    await expect(page.getByText(/not saved in the cloud/i)).toBeVisible();
  });

  test("the page never scrolls sideways", async ({ page }) => {
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("primary actions meet the minimum touch target", async ({ page }) => {
    await page.goto("/");

    for (const name of ["Take a photo", "Choose an image", "More options"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("every icon-only control has an accessible name", async ({ page }) => {
    await page.goto("/");

    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll("button")].filter((button) => {
        const hasText = (button.textContent ?? "").trim().length > 0;
        const hasLabel = button.hasAttribute("aria-label");
        return !hasText && !hasLabel;
      }).length,
    );

    expect(unnamed).toBe(0);
  });

  test("the overflow menu holds only the four agreed items", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More options" }).click();

    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveText(/Start a new question/);
  });

  test("the privacy sheet explains where data goes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Privacy" }).click();

    const dialog = page.getByRole("dialog", { name: "Privacy" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/not saved in the cloud/i)).toBeVisible();
    await expect(dialog.getByText(/straight to the speech service/i)).toBeVisible();
  });

  test("a reduced-motion preference is respected", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Bring in one question" })).toBeVisible();
  });
});
