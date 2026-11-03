import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("tone ID: full round with feedback, then results", async ({ page }) => {
  await page.goto("/tones/identify");
  await page.getByRole("button", { name: "Start listening" }).click();
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "1st tone" }).click();
    await expect(page.getByTestId("feedback")).toBeVisible();
    await page.getByRole("button", { name: i === 19 ? "See results" : "Next →" }).click();
  }
  await expect(page.getByTestId("round-score")).toContainText("/ 20");
});

test("minimal pairs: answer and compare", async ({ page }) => {
  await page.goto("/tones/pairs");
  await page.getByRole("button", { name: "Start listening" }).click();
  await page.getByTestId("pair-option").first().click();
  await expect(page.getByTestId("feedback")).toBeVisible();
  await expect(page.getByRole("button", { name: "🔊 compare" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByTestId("feedback")).toHaveCount(0);
});

test("weakest tone is detected and re-drilled", async ({ page, request }) => {
  // 10 correct answers for tones 1, 2, 4, 5 and mostly-wrong 3rd tones
  const post = (expectedTone: number, answeredTone: number) =>
    request.post("/api/tones/attempt", { data: { exercise: "tone-id", prompt: "test", expectedTone, answeredTone } });
  for (const t of [1, 2, 4, 5]) for (let i = 0; i < 10; i++) await post(t, t);
  for (let i = 0; i < 8; i++) await post(3, 2);
  for (let i = 0; i < 2; i++) await post(3, 3);

  await page.goto("/tones");
  await expect(page.getByTestId("weakest")).toContainText("weakest tone is the 3rd");
  await expect(page.getByTestId("weakest")).toContainText("most often heard as 2nd");
  await page.getByRole("link", { name: "Drill 3rd tone" }).click();
  await expect(page).toHaveURL(/focus=3/);
  await expect(page.getByTestId("focus-banner")).toContainText("3rd tone");
});

test("shadowing: record with mic, compare, self-rate", async ({ page }) => {
  await page.goto("/tones/shadowing");
  await expect(page.getByTestId("shadow-sentence")).toBeVisible();
  await page.getByRole("button", { name: "🎙️ Record yourself" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "■ Stop recording" }).click();
  await expect(page.getByTestId("compare")).toBeVisible();
  await expect(page.getByRole("button", { name: "🎧 Mine" })).toBeVisible();
  const first = await page.getByTestId("shadow-sentence").locator("p").first().textContent();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByTestId("shadow-count")).toHaveText("1 done");
  await expect(page.getByTestId("shadow-sentence").locator("p").first()).not.toHaveText(first!);
});
