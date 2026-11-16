import { Invoice } from "../models/invoice.model";
import { Notification } from "../models/notification.model";
import { Registration } from "../models/registration.model";
import { WaitlistEntry } from "../models/waitlist.model";

/**
 * AVG (GDPR) retention, as decided by the client (31 Oct 2026):
 * - rejected registrations: 30 days;
 * - notifications (meldingen): 12 months;
 * - waitlist sign-ups: 12 months;
 * - invoices: 7 years (Dutch fiscal bewaarplicht).
 * A registration's password hash is only needed until it is handled (the new
 * account has its own copy), so it is removed once approved or rejected.
 */
export const RETENTION = {
  rejectedRegistrationDays: 30,
  notificationMonths: 12,
  waitlistMonths: 12,
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
    Registration.deleteMany({ status: "rejected", updatedAt: { $lt: new Date(now.getTime() - RETENTION.rejectedRegistrationDays * 24 * 60 * 60 * 1000) } }),
    Notification.deleteMany({ createdAt: { $lt: monthsAgo(RETENTION.notificationMonths, now) } }),
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
