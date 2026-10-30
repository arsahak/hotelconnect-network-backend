import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { OTP_TTL_MINUTES } from "./otp";

const RESEND_API_URL = "https://api.resend.com/emails";
const BRAND_NAME = "HotelConnect";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Replies go here instead of to HotelConnect (e.g. the job applicant). */
  replyTo?: string;
  attachments?: EmailAttachment[];
}

/** Escapes user input before it goes into an email's HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sends one email through Resend. Addresses on the reserved ".test" domain
 * (used by the demo data) are never delivered — the email is logged instead,
 * so local testing can't email anyone by accident.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (message.to.toLowerCase().endsWith(".test")) {
    console.log(
      `[email:test] to=${message.to} subject="${message.subject}" attachments=${
        message.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`).join(", ") || "none"
      }`
    );
    return;
  }

  if (!env.resend.apiKey) {
    throw new ApiError(500, "Email delivery is not configured");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.resend.fromEmail,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString("base64"),
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend email send failed:", res.status, body);
    throw new ApiError(502, "Could not send the email. Please try again later.");
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: `Your ${BRAND_NAME} code is ${otp}`,
    html: `<p>Your ${BRAND_NAME} verification code is <strong>${otp}</strong>.</p><p>It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
