import { expect, test } from "@playwright/test";
import { LEARNER, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page, LEARNER));

test("dashboard: streak, words, due, tone accuracy, 30-day chart, 20-minute plan", async ({ page }) => {
  const request = page.request;
  // some activity today
  await request.post("/api/review/answer", { data: { wordId: 1, rating: 4 } }); // Easy → 4 days → learned
  await request.post("/api/review/answer", { data: { wordId: 2, rating: 3 } });
  for (let i = 0; i < 6; i++) await request.post("/api/tones/attempt", { data: { exercise: "tone-id", prompt: "t", expectedTone: 2, answeredTone: i < 2 ? 3 : 2 } });

  await page.goto("/dashboard");
  await expect(page.getByTestId("streak")).toContainText("1day");
  await expect(page.getByTestId("learned")).toContainText(/\d+\/ 300/);
  await expect(page.getByTestId("due")).toBeVisible();
  await expect(page.getByTestId("tone-accuracy")).toContainText("2nd");
  await expect(page.getByRole("img", { name: /Activity over the last 30 days: active on 1 days/ })).toBeVisible();

  const plan = page.getByTestId("plan");
  await expect(plan).toContainText("20-minute session");
  await expect(plan).toContainText("Tone warm-up");
  await expect(plan).toContainText("Shadowing");
  await plan.getByRole("link", { name: /Start|More/ }).first().click();
  await expect(page).toHaveURL(/\/tones\/identify/);
});
