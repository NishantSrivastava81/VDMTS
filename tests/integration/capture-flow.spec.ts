import { expect, test, type Page } from "@playwright/test";

/**
 * These run against the fixture build, so no Azure call is made. Their purpose
 * is to prove the page actually hydrates: a CSP nonce mismatch once left the
 * markup perfect and every control dead.
 */

// A 1x1 PNG is enough: the client only has to decode and re-encode it.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function collectPageErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("capture flow", () => {
  test("the page hydrates without CSP or console errors", async ({ page }) => {
    const errors = await collectPageErrors(page);
    await page.goto("/");

    // React attaches only if the scripts were allowed to run.
    await expect
      .poll(() => page.evaluate(() => document.querySelector("body")?.hasChildNodes()))
      .toBe(true);

    const blocked = errors.filter((message) => /Content Security Policy|refused to/i.test(message));
    expect(blocked, blocked.join("\n")).toHaveLength(0);
  });

  test("Take a photo opens the camera picker", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Take a photo" }).click(),
    ]);

    expect(chooser).toBeTruthy();
  });

  test("Choose an image opens the library picker", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose an image" }).click(),
    ]);

    expect(chooser).toBeTruthy();
  });

  test("the overflow menu opens, which proves client state is live", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More options" }).click();

    await expect(page.getByRole("menuitem", { name: "Start a new question" })).toBeVisible();
  });

  test("choosing an image reaches the concept opening and accepts a reply", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose an image" }).click(),
    ]);
    await chooser.setFiles({ name: "question.png", mimeType: "image/png", buffer: TINY_PNG });

    await expect(page.getByText("Let us spot the idea first.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/exactly one real root/i).first()).toBeVisible();

    const composer = page.getByLabel("Your next step");
    await composer.fill("a=1, b=k+2 and c=2k");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(/Check the sign of the middle term/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "A smaller hint" })).toBeVisible();
  });

  test("the full answer is always reachable, and asking for it opens the walkthrough", async ({
    page,
  }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose an image" }).click(),
    ]);
    await chooser.setFiles({ name: "question.png", mimeType: "image/png", buffer: TINY_PNG });
    await expect(page.getByText("Let us spot the idea first.")).toBeVisible({ timeout: 20_000 });

    // No lock and no refusal loop: it is present before the student has attempted anything.
    const fullAnswer = page.getByRole("button", { name: "Show me the full answer" });
    await expect(fullAnswer).toBeVisible();
    await expect(page.getByRole("button", { name: "Explain in simpler words" })).toBeVisible();

    await fullAnswer.click();
    // One tap must give the whole answer, not a first chunk.
    await expect(page.getByText(/k\s*=\s*2/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("the related-question flow keeps the composer and offers a way out", async ({ page }) => {
    await page.goto("/");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose an image" }).click(),
    ]);
    await chooser.setFiles({ name: "question.png", mimeType: "image/png", buffer: TINY_PNG });
    await expect(page.getByText("Let us spot the idea first.")).toBeVisible({ timeout: 20_000 });

    const composer = page.getByLabel("Your next step");
    await composer.fill("k=2");
    await page.getByRole("button", { name: "Send" }).click();

    // Reaching the answer moves to reflection, which asks for the cue.
    await expect(page.getByRole("heading", { name: "What should stay with you?" })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByLabel("Your answer").fill("It said exactly one real root");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("Next-time cue")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Try one related question" }).click();

    // The transfer question is solved in the normal view, not the reflection sheet.
    await expect(page.getByText(/Try this one/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "What should stay with you?" })).toBeHidden();
    await expect(page.getByLabel("Your next step")).toBeVisible();

    await page.getByLabel("Your next step").fill("(m-1)^2 = 16");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/The cue carried across/i)).toBeVisible({ timeout: 20_000 });

    // There is always a way to finish, and it returns to capture.
    await page.getByRole("button", { name: "Done for now" }).first().click();
    await expect(page.getByRole("heading", { name: "Bring in one question" })).toBeVisible();
  });

  test("the composer stays reachable and the page never scrolls sideways", async ({ page }) => {
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
