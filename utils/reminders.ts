import { env } from "../config/env";
import { Contract, noticeDeadline } from "../models/contract.model";
import { Hotel } from "../models/hotel.model";
import { Notification } from "../models/notification.model";
import { pushToHotel } from "./push";
import { deleteExpiredPurchaseFiles } from "./purchasing";
import { Permit, PERMIT_REMINDER_DAYS } from "../models/permit.model";
import { complianceReminder, languageFor } from "./emailTemplates";
import { sendEmail } from "./sendEmail";

/** Briefing §3.4.1 / §3.4.4: reminders go out 30 days before the date. */
export const REMINDER_DAYS = 30;
const MAX_PERMIT_LEAD = Math.max(...PERMIT_REMINDER_DAYS);

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_EVERY_MS = 60 * 60 * 1000;

type ReminderKind = "contract_end" | "notice_deadline" | "permit_expiry";

interface DueReminder {
  kind: ReminderKind;
  date: Date;
  title: string;
  subtitle?: string;
  /** Dashboard page of the contract or permit. */
  link: string;
  /** End / expiry date and the notice period or reminder lead time (email 6.5). */
  endDate: Date;
  notice: string;
  /** Marks the reminder as sent once the email went out. */
  markSent: () => Promise<unknown>;
}

const KIND_LABELS: Record<ReminderKind, string> = {
  contract_end: "Contract ends",
  notice_deadline: "Last day to cancel (renews automatically)",
  permit_expiry: "Permit expires",
};

/** Dates are stored as midnight UTC (date inputs), so days count in UTC. */
function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sameDay(a?: Date | null, b?: Date | null): boolean {
  return !!a && !!b && startOfDayUtc(a).getTime() === startOfDayUtc(b).getTime();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function daysLeft(date: Date, today: Date): string {
  const days = Math.round((startOfDayUtc(date).getTime() - today.getTime()) / DAY_MS);
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** Contracts and permits whose date is 0–30 days away and not reminded yet, per hotel. */
async function findDueReminders(today: Date): Promise<Map<string, DueReminder[]>> {
  const until = new Date(today.getTime() + REMINDER_DAYS * DAY_MS);
  const inWindow = (date: Date | null) => !!date && date >= today && date <= until;
  const due = new Map<string, DueReminder[]>();
  const add = (hotel: unknown, reminder: DueReminder) => {
    const key = String(hotel);
    due.set(key, [...(due.get(key) ?? []), reminder]);
  };

  // A renewing contract's notice deadline lies before its end date, so those
  // are fetched whenever the end date is still to come.
  const [contracts, permits] = await Promise.all([
    Contract.find({ endDate: { $gte: today }, $or: [{ "noticePeriod.value": { $gt: 0 } }, { endDate: { $lte: until } }] })
      .select("+reminders")
      .lean(),
    // Permits: each has its own lead time (up to 90 days), filtered below.
    Permit.find({ expiryDate: { $gte: today, $lte: new Date(today.getTime() + MAX_PERMIT_LEAD * DAY_MS) } }).select("+reminderSentFor").lean(),
  ]);

  for (const c of contracts) {
    const title = c.contractFor || c.company || "Contract";
    const subtitle = c.contractFor && c.company ? c.company : undefined;
    const notice = c.noticePeriod?.value ? `${c.noticePeriod.value} ${c.noticePeriod.unit ?? "months"}` : "—";
    const end = c.endDate ?? null;
    if (inWindow(end) && !sameDay(c.reminders?.endDate, end)) {
      add(c.hotel, {
        kind: "contract_end",
        date: end!,
        title,
        subtitle,
        link: `/hotel/contracts/${c._id}`,
        endDate: end!,
        notice,
        markSent: () => Contract.updateOne({ _id: c._id }, { "reminders.endDate": end }),
      });
    }
    const deadline = noticeDeadline(c);
    if (inWindow(deadline) && !sameDay(c.reminders?.noticeDeadline, deadline)) {
      add(c.hotel, {
        kind: "notice_deadline",
        date: deadline!,
        title,
        subtitle,
        link: `/hotel/contracts/${c._id}`,
        endDate: end!,
        notice: deadline ? `${notice} (${formatDate(deadline)})` : notice,
        markSent: () => Contract.updateOne({ _id: c._id }, { "reminders.noticeDeadline": deadline }),
      });
    }
  }

  for (const p of permits) {
    if (sameDay(p.reminderSentFor, p.expiryDate)) continue;
    const lead = p.reminderDays ?? REMINDER_DAYS;
    if (p.expiryDate!.getTime() > today.getTime() + lead * DAY_MS) continue;
    add(p.hotel, {
      kind: "permit_expiry",
      date: p.expiryDate!,
      title: p.type,
      subtitle: p.authority || undefined,
      link: `/hotel/permits/${p._id}`,
      endDate: p.expiryDate!,
      notice: `${lead} days`,
      markSent: () => Permit.updateOne({ _id: p._id }, { reminderSentFor: p.expiryDate }),
    });
  }

  return due;
}


/**
 * Reminds every hotel of its contracts and permits that end within 30 days:
 * one email overview and/or one inbox melding per date, as the hotel chose
 * for compliance meldingen. Each date is reminded once.
 */
export async function sendDueReminders(now = new Date()): Promise<{ hotels: number; reminders: number }> {
  const today = startOfDayUtc(now);
  const due = await findDueReminders(today);
  if (!due.size) return { hotels: 0, reminders: 0 };

  const hotels = await Hotel.find({ _id: { $in: [...due.keys()] }, isActive: true }).select("name contactPerson country emails notify notificationChannels notificationPush").lean();
  let sentHotels = 0;
  let sentReminders = 0;

  for (const hotel of hotels) {
    const reminders = due.get(String(hotel._id))!.sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = reminders[0];
    // Briefing §3.12 aanvulling: compliance meldingen go to the inbox, by email, or both.
    const channel = hotel.notificationChannels?.compliance ?? "both";
    const byEmail = channel !== "dashboard" && hotel.notify?.alerts !== false;

    try {
      // Email first: if it fails nothing is marked, and the next run retries
      // without leaving a double melding in the inbox.
      // Email 6.5 (Master Briefing v4): one per contract / permit, from noreply@, in the hotel's language.
      if (byEmail) {
        const lang = languageFor({ country: hotel.country });
        for (const r of reminders) {
          const mail = complianceReminder(lang, {
            managerName: hotel.contactPerson || hotel.name,
            hotelName: hotel.name,
            itemName: r.title,
            supplierName: r.subtitle ?? "",
            expiryDate: formatDate(r.endDate),
            notice: r.notice,
            dashboardLink: `${env.dashboardUrl}${r.link}`,
          });
          await sendEmail({ to: hotel.emails.alerts || hotel.emails.general, subject: mail.subject, html: mail.html, from: mail.from });
        }
      }
      if (channel !== "email") {
        await Notification.insertMany(
          reminders.map((r) => ({
            hotel: hotel._id,
            type: "compliance",
            title: `${KIND_LABELS[r.kind].split(" (")[0]}: ${r.title}`,
            body: `${formatDate(r.date)} (${daysLeft(r.date, today)})${r.subtitle ? ` · ${r.subtitle}` : ""}`,
            link: r.link,
          }))
        );
        if (hotel.notificationPush?.compliance !== false) {
          await pushToHotel(hotel._id, {
            title: reminders.length === 1 ? `Reminder: ${first.title}` : `${reminders.length} contract and permit dates coming up`,
            body: reminders.length === 1 ? `${KIND_LABELS[first.kind].split(" (")[0]} on ${formatDate(first.date)}` : "Open HotelConnect to see them.",
            link: reminders.length === 1 ? first.link : "/notifications",
          });
        }
      }
      await Promise.all(reminders.map((r) => r.markSent()));
      sentHotels += 1;
      sentReminders += reminders.length;
    } catch (err) {
      // Not marked as sent, so the next run tries this hotel again.
      console.error(`Reminder email to ${hotel.name} failed: ${(err as Error).message}`);
    }
  }

  return { hotels: sentHotels, reminders: sentReminders };
}

let running = false;

/**
 * Everything that runs by itself (briefing §1 "automatisering"): contract and
 * permit reminders, and deleting the invoices of completed collective
 * purchases after 90 days (§3.13, AVG). Called every hour by a long-running
 * server, and once a day by Vercel Cron (GET /cron/daily) when serverless.
 */
export async function runScheduledJobs() {
  const reminders = await sendDueReminders();
  if (reminders.reminders) console.log(`[reminders] sent ${reminders.reminders} reminder(s) to ${reminders.hotels} hotel(s)`);
  const invoices = await deleteExpiredPurchaseFiles();
  if (invoices.files) console.log(`[purchasing] deleted ${invoices.files} invoice(s) of ${invoices.actions} completed action(s)`);
  // Billing and ads: renew memberships, pick up Moneybird payments, rotate sponsored spots.
  const { renewSubscriptions, runCommissionDunning, syncMoneybirdPayments } = await import("../services/billing");
  const { rotateAds } = await import("../services/ads");
  const memberships = await renewSubscriptions();
  const moneybird = await syncMoneybirdPayments();
  const commission = await runCommissionDunning();
  const ads = await rotateAds();
  const { applyRetention } = await import("./retention");
  const retention = await applyRetention();
  // Story images uploaded with the editor but never used (older than a day).
  const { sweepUnusedContentImages } = await import("./contentImages");
  const contentImages = await sweepUnusedContentImages().catch((error) => {
    console.error("[storage] content image sweep failed:", error instanceof Error ? error.message : error);
    return { deleted: 0 };
  });
  if (contentImages.deleted) console.log(`[storage] deleted ${contentImages.deleted} unused story image(s)`);
  return { reminders, invoices, memberships, moneybird, commission, ads, retention, contentImages };
}

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runScheduledJobs();
  } catch (err) {
    console.error(`[reminders] run failed: ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

/** Checks for due reminders now and then every hour while the server runs. */
export function startReminderSchedule(): void {
  void runOnce();
  setInterval(runOnce, RUN_EVERY_MS).unref();
}
