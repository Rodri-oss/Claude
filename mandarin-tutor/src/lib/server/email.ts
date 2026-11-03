import "server-only";

export interface MailResult {
  delivered: boolean;
  provider: "resend" | "smtp" | "console";
}

export function emailProvider(): MailResult["provider"] {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return "console";
}

/**
 * Send an email via Resend (RESEND_API_KEY) or SMTP (SMTP_URL). Without either,
 * the message is printed to the server console — fine for local development.
 */
export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<MailResult> {
  const from = process.env.EMAIL_FROM || "Taiwan Mandarin Tutor <onboarding@resend.dev>";
  const provider = emailProvider();
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    return { delivered: true, provider };
  }
  if (provider === "smtp") {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from, to, subject, text, html });
    return { delivered: true, provider };
  }
  console.log(`\n📧 [email to ${to}] ${subject}\n${text}\n`);
  return { delivered: false, provider };
}
