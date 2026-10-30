import { env } from "../config/env";
import { Contract, noticeDeadline } from "../models/contract.model";
import { Hotel } from "../models/hotel.model";
import { Notification } from "../models/notification.model";
import { pushToHotel } from "./push";
import { deleteExpiredPurchaseFiles } from "./purchasing";
import { Permit } from "../models/permit.model";
import { escapeHtml, sendEmail } from "./sendEmail";

/** Briefing §3.4.1 / §3.4.4: reminders go out 30 days before the date. */
export const REMINDER_DAYS = 30;

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
    Contract.find({ endDate: { $gte: today }, $or: [{ autoRenew: true }, { endDate: { $lte: until } }] })
      .select("+reminders")
      .lean(),
    Permit.find({ expiryDate: { $gte: today, $lte: until } }).select("+reminderSentFor").lean(),
  ]);

  for (const c of contracts) {
    const title = c.contractFor || c.company || "Contract";
    const subtitle = c.contractFor && c.company ? c.company : undefined;
    const end = c.endDate ?? null;
    if (inWindow(end) && !sameDay(c.reminders?.endDate, end)) {
      add(c.hotel, {
        kind: "contract_end",
        date: end!,
        title,
        subtitle,
        link: `/hotel/contracts/${c._id}`,
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
        markSent: () => Contract.updateOne({ _id: c._id }, { "reminders.noticeDeadline": deadline }),
      });
    }
  }

  for (const p of permits) {
    if (sameDay(p.reminderSentFor, p.expiryDate)) continue;
    add(p.hotel, {
      kind: "permit_expiry",
      date: p.expiryDate!,
      title: p.type,
      subtitle: p.authority || undefined,
      link: `/hotel/permits/${p._id}`,
      markSent: () => Permit.updateOne({ _id: p._id }, { reminderSentFor: p.expiryDate }),
    });
  }

  return due;
}

function reminderEmail(hotelName: string, reminders: DueReminder[], today: Date): string {
  const rows = reminders
    .map(
      (r) => `<tr>
        <td style="padding:6px 16px 6px 0;white-space:nowrap"><strong>${formatDate(r.date)}</strong><br><span style="color:#6f665b;font-size:12px">${daysLeft(r.date, today)}</span></td>
        <td style="padding:6px 16px 6px 0">${escapeHtml(r.title)}${r.subtitle ? `<br><span style="color:#6f665b;font-size:12px">${escapeHtml(r.subtitle)}</span>` : ""}</td>
        <td style="padding:6px 0;color:#9f7b3b">${KIND_LABELS[r.kind]}</td>
      </tr>`
    )
    .join("");

  return `
    <p>Dear ${escapeHtml(hotelName)},</p>
    <p>These dates in your contract register and permits are coming up in the next ${REMINDER_DAYS} days:</p>
    <table style="border-collapse:collapse">${rows}</table>
    ${
      reminders.some((r) => r.kind === "notice_deadline")
        ? `<p style="margin-top:16px">Want to stop a contract that renews automatically? Cancel it before the last day to cancel.</p>`
        : ""
    }
    <p style="margin-top:16px"><a href="${env.dashboardUrl}/dashboard" style="color:#9f7b3b">Open your HotelConnect dashboard</a></p>
    <p style="color:#6f665b;font-size:12px;margin-top:16px">You get this email because system alerts are switched on in your email settings.</p>
  `;
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

  const hotels = await Hotel.find({ _id: { $in: [...due.keys()] }, isActive: true }).select("name emails notify notificationChannels notificationPush").lean();
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
      if (byEmail) {
        await sendEmail({
          to: hotel.emails.alerts || hotel.emails.general,
          subject:
            reminders.length === 1
              ? `Reminder: ${KIND_LABELS[first.kind].split(" (")[0].toLowerCase()} – ${first.title} (${formatDate(first.date)})`
              : `Reminder: ${reminders.length} contract and permit dates coming up`,
          html: reminderEmail(hotel.name, reminders, today),
        });
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
  const { renewSubscriptions, syncMoneybirdPayments } = await import("../services/billing");
  const { rotateAds } = await import("../services/ads");
  const memberships = await renewSubscriptions();
  const moneybird = await syncMoneybirdPayments();
  const ads = await rotateAds();
  const { applyRetention } = await import("./retention");
  const retention = await applyRetention();
  return { reminders, invoices, memberships, moneybird, ads, retention };
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
