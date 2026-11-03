import { expect, test } from "@playwright/test";
import { LEARNER, login } from "./helpers";

test.beforeEach(async ({ page }) => login(page, LEARNER));

test.describe.configure({ mode: "serial" });

test("review: 10 new cards, SM-2 buttons, daily limit", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByTestId("review-counts")).toContainText("10 new");
  await expect(page.getByTestId("review-counts")).toContainText("0 due");
  // new cards are shown with their answer
  await expect(page.getByTestId("english")).toBeVisible();
  await expect(page.getByTestId("pinyin").first()).toBeVisible();
  await expect(page.getByTestId("zhuyin").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Good\s*1d/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Easy\s*4d/ })).toBeVisible();

  // First card: Again → it comes back later in the session
  const first = await page.getByTestId("hanzi").textContent();
  await page.getByRole("button", { name: /^Again/ }).click();
  await expect(page.getByTestId("review-counts")).toContainText("9 new");
  await expect(page.getByTestId("review-counts")).toContainText("1 due");

  // Answer everything else Good (10 more answers: 9 new + the relearn card)
  let sawRelearn = false;
  for (let answered = 1; answered <= 10; answered++) {
    const reveal = page.getByRole("button", { name: "Show answer" });
    if (await reveal.isVisible()) {
      await expect(page.getByTestId("hanzi")).toHaveText(first!);
      sawRelearn = true;
      await reveal.click();
    }
    await page.getByRole("button", { name: /^Good/ }).click();
    if (answered < 10) await expect(page.getByTestId("review-counts")).toContainText(`${answered + 1} done`);
  }
  expect(sawRelearn).toBe(true);
  await expect(page.getByTestId("review-done")).toContainText("limit of 10 new cards");

  // Reload: daily limit holds, nothing due
  await page.goto("/review");
  await expect(page.getByTestId("review-done")).toContainText("Nothing to review");
});

test("vocab: browse by level/topic, search, toggle phonetics", async ({ page }) => {
  await page.goto("/vocab");
  await expect(page.getByTestId("vocab-list").locator("li")).not.toHaveCount(0);
  await page.getByRole("button", { name: /MRT/ }).click();
  await page.getByRole("tab", { name: /All levels/ }).click();
  await expect(page.getByTestId("vocab-list").locator("li")).toHaveCount(25);
  await page.getByLabel("Search words").fill("xuesheng");
  await expect(page.getByTestId("vocab-list")).toContainText("學生");
  await page.getByLabel("Search words").fill("password");
  await expect(page.getByTestId("vocab-list")).toContainText("密碼");
  await expect(page.getByTestId("vocab-list")).toContainText("ㄇㄧˋ ㄇㄚˇ");

  // Zhuyin toggle off hides Zhuyin everywhere and persists
  await page.getByRole("button", { name: "ㄅㄆㄇ" }).click();
  await expect(page.getByTestId("zhuyin")).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByLabel("Search words").fill("password");
  await expect(page.getByTestId("pinyin").first()).toBeVisible();
  await expect(page.getByTestId("zhuyin")).toHaveCount(0);
  await page.getByRole("button", { name: "ㄅㄆㄇ" }).click();
  await expect(page.getByTestId("zhuyin").first()).toBeVisible();
});
