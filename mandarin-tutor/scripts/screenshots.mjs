// Regenerate the landing-page screenshots (public/screenshots/*.png) from a demo database.
//
//   rm -f prisma/demo.db
//   DATABASE_URL=file:./demo.db npx prisma migrate deploy && DATABASE_URL=file:./demo.db npx prisma db seed
//   DATABASE_URL=file:./demo.db npx tsx scripts/demo-data.ts demo@example.com
//   DATABASE_URL=file:./demo.db ADMIN_EMAIL=nobody@example.com npm run dev -- -p 3300   (in another terminal)
//   node scripts/screenshots.mjs http://localhost:3300 demo@example.com
import { chromium, devices } from "playwright";

const base = process.argv[2] ?? "http://localhost:3300";
const email = process.argv[3] ?? "demo@example.com";
const out = new URL("../public/screenshots/", import.meta.url).pathname;

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Taipei", permissions: ["microphone"], colorScheme: "light" });
const page = await ctx.newPage();

const r = await page.request.post(`${base}/api/auth/request`, { data: { email } });
const token = new URL((await r.json()).devLink).searchParams.get("token");
await page.request.post(`${base}/api/auth/verify`, { data: { token } });

const shots = [
  ["dashboard", "/dashboard"],
  ["review", "/review", async () => page.getByRole("button", { name: "Show answer" }).click().catch(() => {})],
  ["tones", "/tones"],
  ["toneid", "/tones/identify?focus=3", async () => {
    await page.getByRole("button", { name: "Start listening" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "3rd tone" }).click();
  }],
  ["shadow", "/tones/shadowing", async () => {
    await page.getByRole("button", { name: "🎙️ Record yourself" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "■ Stop recording" }).click();
    await page.waitForTimeout(800);
  }],
];
for (const [name, path, before] of shots) {
  await page.goto(base + path);
  await page.waitForTimeout(800);
  if (before) await before();
  await page.waitForTimeout(400);
  // hide the Next.js dev indicator
  await page.addStyleTag({ content: "nextjs-portal,[data-testid=voice-status]{display:none!important}" });
  await page.screenshot({ path: `${out}${name}.png` }); // viewport-sized, like a phone screen
  console.log("saved", name);
}
await browser.close();
