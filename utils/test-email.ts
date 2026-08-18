import "dotenv/config";
import nodemailer from "nodemailer";

async function main() {
  const host = process.env.ZOHO_SMTP_HOST ?? "smtp.zoho.in";
  const port = Number(process.env.ZOHO_SMTP_PORT ?? 465);
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_APP_PASSWORD;
  const to = process.env.CEO_EMAIL ?? process.env.ZOHO_SMTP_USER;

  if (!user || !pass) {
    console.error("❌  ZOHO_SMTP_USER or ZOHO_SMTP_APP_PASSWORD is empty in .env");
    process.exit(1);
  }

  console.log(`Connecting to ${host}:${port} as ${user} …`);

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });

  console.log("Verifying SMTP connection …");
  await transport.verify();
  console.log("✅  SMTP connection OK");

  console.log(`Sending test email to ${to} …`);
  const info = await transport.sendMail({
    from: `"Meeting Intelligence Test" <${user}>`,
    to: to!,
    subject: "Test email from Digital Mojo Meeting Intelligence",
    text: "If you received this, Zoho SMTP is configured correctly.",
    html: "<p>If you received this, <strong>Zoho SMTP is configured correctly.</strong></p>",
  });

  console.log("✅  Email sent:", info.messageId);
}

main().catch((err) => {
  console.error("❌  Failed:", err.message ?? err);
  process.exit(1);
});
