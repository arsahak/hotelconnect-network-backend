import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const deploymentHost =
  process.env.API_PUBLIC_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL;
const publicUrl = deploymentHost
  ? deploymentHost.startsWith("http")
    ? deploymentHost.replace(/\/$/, "")
    : `https://${deploymentHost.replace(/\/$/, "")}`
  : `http://localhost:${port}`;

// DigitalOcean Spaces keys are optional: without them the server still runs,
// and only file uploads (e.g. avatars) return a "not configured" error.
const requiredVars = ["MONGO_URI", "JWT_SECRET"] as const;

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const origin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI as string,
  appName: process.env.APP_NAME || "HotelConnect",
  // MONGO_URI has no database path segment, so the db name is passed to
  // mongoose.connect() separately via this.
  dbName: process.env.DB_NAME || "hotelconnect",
  // The public website (links in e-mails). CLIENT_URL is the older name.
  websiteUrl: (process.env.WEBSITE_URL || process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, ""),
  // The dashboard (links in e-mails to members).
  dashboardUrl: (process.env.DASHBOARD_URL || "http://localhost:3001").replace(/\/$/, ""),
  // CORS in production: the website and the dashboard may call the API from the browser.
  get clientUrls(): string[] {
    return [...new Set([origin(this.websiteUrl), origin(this.dashboardUrl)].filter(Boolean))];
  },
  // Briefing §7: admins sign in with an emailed code as a second step.
  // Only for local development it can be switched off with ADMIN_TWO_FACTOR=off.
  adminTwoFactor: process.env.ADMIN_TWO_FACTOR !== "off" || process.env.NODE_ENV === "production",
  // Web push for the dashboard PWA (briefing: push for tenders, deadlines, repairs).
  // Without keys, push is simply off.
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    subject: process.env.VAPID_SUBJECT || "mailto:info@hotelconnect.nl",
  },
  // Payments (briefing "Betalingen en facturatie"). Without keys, invoices are
  // still made in the platform and an admin can mark them as paid.
  mollie: { apiKey: process.env.MOLLIE_API_KEY || "" },
  moneybird: {
    token: process.env.MONEYBIRD_TOKEN || "",
    administrationId: process.env.MONEYBIRD_ADMINISTRATION_ID || "",
  },
  // Vercel Cron calls GET /api/v1/cron/daily with "Authorization: Bearer <CRON_SECRET>".
  cronSecret: process.env.CRON_SECRET || "",
  isProduction:
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  publicUrl,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // File storage (images, videos, PDFs): any S3-compatible object storage —
  // Hetzner Object Storage (e.g. STORAGE_ENDPOINT=fsn1.your-objectstorage.com,
  // STORAGE_REGION=fsn1) or DigitalOcean Spaces. The older DO_SPACES_* names
  // still work. Without keys, local development stores files on disk.
  spaces: {
    key: process.env.STORAGE_KEY || process.env.DO_SPACES_KEY || "",
    secret: process.env.STORAGE_SECRET || process.env.DO_SPACES_SECRET || "",
    // Host only — no protocol, no bucket prefix.
    endpoint: (process.env.STORAGE_ENDPOINT || process.env.DO_SPACES_ENDPOINT || "").replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    region: process.env.STORAGE_REGION || process.env.DO_SPACES_REGION || "",
    bucket: process.env.STORAGE_BUCKET || process.env.DO_SPACES_BUCKET || "",
    // Optional CDN / custom domain for public files; falls back to the
    // bucket's own URL (https://<bucket>.<endpoint>/<key>).
    cdnEndpoint: process.env.STORAGE_PUBLIC_URL || process.env.DO_SPACES_CDN_ENDPOINT || "",
    // All uploads live under this root prefix, so this project's files stay
    // apart from anything else in the bucket. Surrounding slashes are stripped.
    rootFolder: (process.env.STORAGE_FOLDER || process.env.DO_SPACES_FOLDER_NAME || "hotelconnect").replace(
      /^\/+|\/+$/g,
      "",
    ),
  },
  // Mailing lists (waitlist, members, newsletter). Optional: without these the
  // waitlist is only stored in the database.
  brevo: {
    apiKey: process.env.BREVO_API_KEY || "",
    waitlistListId: Number(process.env.BREVO_WAITLIST_LIST_ID) || 0,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    fromEmail: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
  },
  // System emails from noreply@hotelconnectnetwork.com (MAIL_FROM) and info@ (MAIL_FROM_INFO),
  // replies to info@ (MAIL_REPLY_TO); through SMTP when SMTP_HOST is set, otherwise Resend.
  mail: {
    from: process.env.MAIL_FROM || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    fromInfo: process.env.MAIL_FROM_INFO || process.env.MAIL_FROM || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    replyTo: process.env.MAIL_REPLY_TO || "",
  },
  // When SMTP_HOST is set, emails go through SMTP (e.g. TransIP) instead of Resend.
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
  },
};
