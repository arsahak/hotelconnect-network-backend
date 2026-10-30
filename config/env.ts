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

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI as string,
  appName: process.env.APP_NAME || "HotelConnect",
  // MONGO_URI has no database path segment, so the db name is passed to
  // mongoose.connect() separately via this.
  dbName: process.env.DB_NAME || "hotelconnect",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  clientUrls: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  // Linked from emails to hotels (e.g. contract reminders).
  dashboardUrl: (process.env.DASHBOARD_URL || "http://localhost:3001").replace(/\/$/, ""),
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
  spaces: {
    key: process.env.DO_SPACES_KEY || "",
    secret: process.env.DO_SPACES_SECRET || "",
    // e.g. "nyc3.digitaloceanspaces.com" — no protocol, no bucket prefix.
    endpoint: process.env.DO_SPACES_ENDPOINT || "",
    region: process.env.DO_SPACES_REGION || "",
    bucket: process.env.DO_SPACES_BUCKET || "",
    // Optional CDN endpoint for faster public delivery; falls back to the
    // bucket's direct Spaces URL when unset.
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT || "",
    // All uploads live under this root prefix within the shared bucket, so
    // this project's files stay namespaced from other apps using the bucket.
    // Set via DO_SPACES_FOLDER_NAME; surrounding slashes are stripped.
    rootFolder: (process.env.DO_SPACES_FOLDER_NAME || "hotelconnect").replace(
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
  }
};
