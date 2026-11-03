import { createLoginToken, LOGIN_TOKEN_MINUTES } from "@/lib/server/auth";
import { emailProvider, sendEmail } from "@/lib/server/email";
import { HttpError, json, readJson } from "@/lib/server/api";
import { normalizeEmail, safeNext } from "@/lib/server/tokens";

/** Step 1 of magic-link sign-in: email a one-time link. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!email) throw new HttpError(400, "Please enter a valid email address.");
    const next = safeNext(body.next);
    const token = await createLoginToken(email, next);
    if (!token) throw new HttpError(429, "Too many sign-in links requested. Try again in an hour.");

    const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
    const link = `${base}/login/verify?token=${token}`;
    const text = `Sign in to Taiwan Mandarin Tutor:\n\n${link}\n\nThis link expires in ${LOGIN_TOKEN_MINUTES} minutes. If you didn't ask for it, ignore this email.`;
    const html = `<p>Sign in to <b>Taiwan Mandarin Tutor</b>:</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#c8372d;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p><p style="color:#666">This link expires in ${LOGIN_TOKEN_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>`;
    await sendEmail(email, "Your sign-in link · 華語 Taiwan Tutor", text, html);

    // Local development without an email provider: hand the link back so you can click it.
    // (E2E_EXPOSE_LOGIN_LINKS is for the automated tests only. Never set it on a real deployment.)
    const exposeLink = process.env.NODE_ENV !== "production" || process.env.E2E_EXPOSE_LOGIN_LINKS === "1";
    const devLink = emailProvider() === "console" && exposeLink ? link : undefined;
    return json({ ok: true, devLink });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Couldn't send the email. Please try again." }, 500);
  }
}
