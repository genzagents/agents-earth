import nodemailer from "nodemailer";

const {
  SMTP_HOST = "smtp.gmail.com",
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM = "AgentColony <noreply@genzagents.io>",
} = process.env;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: parseInt(SMTP_PORT, 10) === 465,
      auth: SMTP_USER && SMTP_PASS
        ? { user: SMTP_USER, pass: SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMagicLinkEmail(email: string, magicUrl: string): Promise<void> {
  const transport = getTransporter();

  await transport.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject: "Your AgentColony sign-in link",
    text: `Click the link below to sign in to AgentColony (expires in 15 minutes):\n\n${magicUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Sign in to AgentColony</h2>
        <p>Click the button below to sign in. This link expires in 15 minutes.</p>
        <a href="${magicUrl}"
           style="display: inline-block; background: #7c3aed; color: white;
                  padding: 12px 24px; border-radius: 6px; text-decoration: none;
                  font-weight: bold; margin: 16px 0;">
          Sign In
        </a>
        <p style="color: #6b7280; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.<br/>
          Link: <a href="${magicUrl}">${magicUrl}</a>
        </p>
      </div>
    `,
  });
}
