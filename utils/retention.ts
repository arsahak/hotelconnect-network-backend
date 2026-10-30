import { Invoice } from "../models/invoice.model";
import { Notification } from "../models/notification.model";
import { Registration } from "../models/registration.model";
import { WaitlistEntry } from "../models/waitlist.model";

/**
 * AVG (GDPR) retention — briefing §5. Defaults, to be confirmed with the client:
 * - a registration's password hash is only needed until it is handled (the
 *   new account has its own copy), so it is removed once approved or rejected;
 * - rejected registrations are deleted after 12 months;
 * - read meldingen are deleted after 12 months;
 * - waitlist sign-ups are deleted after 24 months;
 * - invoices are kept 7 years (Dutch fiscal bewaarplicht), then deleted.
 */
export const RETENTION = {
  rejectedRegistrationMonths: 12,
  readNotificationMonths: 12,
  waitlistMonths: 24,
  invoiceYears: 7,
} as const;

const monthsAgo = (months: number, now: Date) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
};

export async function applyRetention(now = new Date()) {
  const [hashes, registrations, notifications, waitlist, invoices] = await Promise.all([
    Registration.updateMany({ status: { $ne: "pending" }, passwordHash: { $exists: true } }, { $unset: { passwordHash: 1 } }),
    Registration.deleteMany({ status: "rejected", updatedAt: { $lt: monthsAgo(RETENTION.rejectedRegistrationMonths, now) } }),
    Notification.deleteMany({ readAt: { $ne: null }, createdAt: { $lt: monthsAgo(RETENTION.readNotificationMonths, now) } }),
    WaitlistEntry.deleteMany({ createdAt: { $lt: monthsAgo(RETENTION.waitlistMonths, now) } }),
    Invoice.deleteMany({ issuedAt: { $lt: monthsAgo(RETENTION.invoiceYears * 12, now) } }),
  ]);
  const result = {
    passwordHashesCleared: hashes.modifiedCount,
    registrations: registrations.deletedCount,
    notifications: notifications.deletedCount,
    waitlist: waitlist.deletedCount,
    invoices: invoices.deletedCount,
  };
  if (Object.values(result).some(Boolean)) console.log("[retention]", result);
  return result;
}
