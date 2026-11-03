import { expect, test } from "@playwright/test";
import { e2eDb, LEARNER, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to /login; APIs return 401", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);
  const res = await page.request.get("/api/review/queue");
  expect(res.status()).toBe(401);
});

test("magic-link sign-in through the UI; each learner has their own progress", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("New.Learner@Example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByTestId("login-sent")).toContainText(/new\.learner@example\.com/i);
  await page.getByTestId("dev-link").click();
  await expect(page).toHaveURL(/\/login\/verify\?token=/);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // fresh account: no progress, its own 10 new cards
  await expect(page.getByTestId("streak")).toContainText("0days");
  await expect(page.getByTestId("learned")).toContainText("0/ 300");
  await page.goto("/review");
  await expect(page.getByTestId("review-counts")).toContainText("10 new");
  await page.goto("/settings");
  await expect(page.getByText("Signed in as new.learner@example.com")).toBeVisible();
  // sign out
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // the original learner still has their progress
  await login(page, LEARNER);
  await page.goto("/dashboard");
  await expect(page.getByTestId("streak")).toContainText("1day");
});

test("sign-in links are single-use", async ({ page }) => {
  const res = await page.request.post("/api/auth/request", { data: { email: "once@example.com" } });
  const token = new URL((await res.json()).devLink).searchParams.get("token");
  expect((await page.request.post("/api/auth/verify", { data: { token } })).ok()).toBe(true);
  const again = await page.request.post("/api/auth/verify", { data: { token } });
  expect(again.status()).toBe(400);
  await page.goto("/login/verify?token=bogus");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This sign-in link is invalid or has expired.")).toBeVisible();
});

test("landing page: who it's for, screenshots, waitlist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Taiwan");
  await expect(page.getByRole("heading", { name: "Who it's for" })).toBeVisible();
  const shots = page.locator("img[src*='screenshots'], img[srcset*='screenshots']");
  expect(await shots.count()).toBeGreaterThanOrEqual(4);
  const waitlist = page.locator("#waitlist");
  await waitlist.getByPlaceholder("you@example.com").fill("fan@example.com");
  await waitlist.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByTestId("waitlist-done")).toContainText("fan@example.com");
  // duplicates are fine
  const dup = await page.request.post("/api/waitlist", { data: { email: "fan@example.com" } });
  expect((await dup.json()).already).toBe(true);
});

test("pricing: paid tiers show 'coming soon' + early access; clicks are recorded", async ({ page }) => {
  await page.goto("/pricing");
  await page.getByTestId("tier-pro").getByRole("button", { name: "Choose Pro" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Pro is coming soon. Want early access?");
  await expect(dialog).toContainText("haven't been charged");
  await dialog.getByPlaceholder("you@example.com").fill("payer@example.com");
  await dialog.getByRole("button", { name: "Get early access" }).click();
  await expect(page.getByTestId("waitlist-done")).toBeVisible();
  await dialog.getByRole("button", { name: "Maybe later" }).click();

  await page.getByTestId("tier-proplus").getByRole("button", { name: "Choose Pro+" }).click();
  await expect(page.getByRole("dialog")).toContainText("Pro+");
  await page.getByRole("button", { name: "Maybe later" }).click();

  await page.getByTestId("tier-free").getByRole("button", { name: "Start free" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("survey appears after the 5th session; 'Not now' defers it; answers are saved", async ({ page }) => {
  const email = "surveyed@example.com";
  await login(page, email);
  const db = e2eDb();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  for (let i = 0; i < 4; i++) await db.studySession.create({ data: { userId: user.id, startedAt: hoursAgo(50 - i * 10), lastActiveAt: hoursAgo(50 - i * 10) } });

  await page.goto("/dashboard");
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await db.studySession.create({ data: { userId: user.id, startedAt: hoursAgo(2), lastActiveAt: hoursAgo(2) } });
  await page.goto("/dashboard");
  await expect(page.getByRole("dialog")).toContainText("4 answers");
  await Promise.all([page.waitForResponse("**/api/survey/dismiss"), page.getByRole("button", { name: "Not now" }).click()]);
  await page.goto("/vocab");
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // next session → asked again
  await db.studySession.create({ data: { userId: user.id, startedAt: new Date(), lastActiveAt: new Date() } });
  await page.goto("/dashboard");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText("Novice: I know some basics").click();
  await dialog.getByText("Studying in Taiwan").click();
  await dialog.getByText("Shadowing", { exact: true }).click();
  await dialog.getByText("$5–9").click();
  await dialog.getByRole("textbox").fill("More MRT phrases please");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByTestId("survey-thanks")).toBeVisible();
  await page.goto("/dashboard");
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("admin page: only for ADMIN_EMAIL; shows signups, DAU, retention, survey, pricing clicks", async ({ page }) => {
  // retention fixture: two learners who signed up 8 days ago, one came back on day 7
  const db = e2eDb();
  const { dayKey, addDays } = await import("../../src/lib/dates");
  const created = new Date(Date.now() - 8 * 86400_000);
  const r1 = await db.user.create({ data: { email: "ret1@example.com", createdAt: created } });
  await db.user.create({ data: { email: "ret2@example.com", createdAt: created } });
  await db.activityDay.create({ data: { userId: r1.id, date: addDays(dayKey(created, r1.timezone), 7), reviews: 3 } });

  // a regular learner can't see it
  await login(page, "new.learner@example.com");
  expect((await page.goto("/admin"))!.status()).toBe(404);
  expect((await page.request.get("/api/admin/export?kind=survey")).status()).toBe(404);

  await login(page, LEARNER);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Demand test/ })).toBeVisible();
  const kpis = page.getByTestId("admin-kpis");
  await expect(kpis).toContainText("Accounts");
  await expect(kpis).toContainText("Waitlist emails2"); // fan@ + payer@
  await expect(page.getByTestId("retention")).toContainText("D7: 50%");
  await expect(page.getByTestId("clicks-pro")).toHaveText("1 click");
  await expect(page.getByTestId("clicks-proplus")).toHaveText("1 click");
  await expect(page.getByTestId("clicks-free")).toHaveText("1 click");
  await expect(page.getByTestId("survey-summary")).toContainText("Studying in Taiwan");
  await expect(page.getByText("More MRT phrases please")).toBeVisible();

  const csv = await page.request.get("/api/admin/export?kind=survey");
  expect(await csv.text()).toContain("surveyed@example.com");
});
