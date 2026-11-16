import type mongoose from "mongoose";
import { env } from "../config/env";
import {
  COMMISSION_DUNNING_DAYS,
  COMMISSION_ENABLED,
  COMMISSION_MAX,
  COMMISSION_PAYMENT_TERM_DAYS,
  COMMISSION_PERCENT,
  euros,
  FOUNDING_FREE_MONTHS,
  hotelTier,
  NOTICE_MONTHS,
  PAYMENT_TERM_DAYS,
  SUPPLIER_FREE_UNTIL,
  SUPPLIER_PRICES,
  VAT_RATE,
  type BillingInterval,
  type PaymentMethod,
  type SubscriptionPlan,
} from "../config/billing";
import { Counter } from "../models/counter.model";
import { Hotel } from "../models/hotel.model";
import { Invoice, type IInvoice, type InvoiceKind } from "../models/invoice.model";
import { Subscription, type ISubscription } from "../models/subscription.model";
import { Supplier } from "../models/supplier.model";
import { ADMIN_ROLES, User } from "../models/user.model";
import { notifyHotel, notifySupplier } from "../utils/notify";
import { escapeHtml, sendEmail } from "../utils/sendEmail";
import { createMolliePayment, mollieEnabled } from "./mollie";
import {
  createAndSendMoneybirdInvoice,
  ensureMoneybirdContact,
  ensureMoneybirdMandateRequested,
  getMoneybirdInvoiceState,
  moneybirdEnabled,
  registerMoneybirdPayment,
} from "./moneybird";

type Id = mongoose.Types.ObjectId | string;
export type Owner = { hotel: Id } | { supplier: Id };

const DAY = 24 * 60 * 60 * 1000;

/** HC-2026-0001, HC-2026-0002, … (one series per year). */
async function nextInvoiceNumber(date = new Date()) {
  const year = date.getUTCFullYear();
  const counter = await Counter.findByIdAndUpdate(`invoice-${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `HC-${year}-${String(counter!.seq).padStart(4, "0")}`;
}

export function addInterval(date: Date, interval: BillingInterval, times = 1) {
  const next = new Date(date);
  if (interval === "year") next.setUTCFullYear(next.getUTCFullYear() + times);
  else next.setUTCMonth(next.getUTCMonth() + (interval === "quarter" ? 3 : 1) * times);
  return next;
}

/** The hotel or supplier behind an invoice, for Moneybird and notifications. */
async function ownerDetails(owner: Owner) {
  if ("hotel" in owner) {
    const h = await Hotel.findById(owner.hotel).select("name memberNumber emails address city kvkNumber").lean();
    return h && { type: "hotel" as const, name: h.name, memberNumber: h.memberNumber, email: h.emails.invoices || h.emails.general, address: h.address, city: h.city, kvkNumber: h.kvkNumber };
  }
  const s = await Supplier.findById(owner.supplier).select("name memberNumber contact emails kvkNumber").lean();
  return s && { type: "supplier" as const, name: s.name, memberNumber: s.memberNumber, email: s.emails?.invoices || s.contact.email, address: "", city: "", kvkNumber: s.kvkNumber };
}

/** Tells the hotel (melding type "system") or supplier about an invoice. */
async function notifyOwner(owner: Owner, title: string, body: string, link: string) {
  if ("hotel" in owner) await notifyHotel(String(owner.hotel), { type: "system", title, body, link });
  else await notifySupplier(String(owner.supplier), { type: "system", title, body, link });
}

const invoicesLink = (owner: Owner) => ("hotel" in owner ? "/hotel/invoices" : "/supplier/invoices");

/**
 * Creates an invoice (cents, excl. VAT) and gets it paid:
 * - Moneybird configured → created and emailed from Moneybird; with
 *   `paymentMethod: "sepa"` the member is also asked for a SEPA direct-debit
 *   mandate (once), so Moneybird collects this and later invoices itself;
 * - `checkout` (homepage ads) → a Mollie payment link, when Mollie is configured;
 * - otherwise → stays open; an admin marks it paid once the money is in.
 */
export async function createInvoice(input: {
  owner: Owner;
  kind: InvoiceKind;
  description: string;
  lines: { description: string; quantity?: number; unitPrice: number }[];
  periodStart?: Date;
  periodEnd?: Date;
  reference?: Id;
  meta?: Record<string, string>;
  checkout?: boolean;
  notify?: boolean;
  paymentMethod?: PaymentMethod;
  dueInDays?: number;
}): Promise<IInvoice> {
  const lines = input.lines.map((l) => ({ description: l.description, quantity: l.quantity ?? 1, unitPrice: Math.round(l.unitPrice) }));
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const vat = Math.round((subtotal * VAT_RATE) / 100);
  const invoice = await Invoice.create({
    number: await nextInvoiceNumber(),
    ...input.owner,
    kind: input.kind,
    description: input.description,
    lines,
    subtotal,
    vat,
    total: subtotal + vat,
    dueDate: new Date(Date.now() + (input.dueInDays ?? PAYMENT_TERM_DAYS) * DAY),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    reference: input.reference ?? null,
    meta: { ...(input.meta ?? {}), ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}) },
  });

  const owner = await ownerDetails(input.owner);
  if (owner && moneybirdEnabled()) {
    try {
      const contactId = await ensureMoneybirdContact({ companyName: owner.name, email: owner.email, address: owner.address, city: owner.city, kvkNumber: owner.kvkNumber, customerId: owner.memberNumber });
      if (input.paymentMethod === "sepa") await ensureMoneybirdMandateRequested(contactId);
      const sent = await createAndSendMoneybirdInvoice({ contactId, reference: invoice.number, lines });
      invoice.moneybirdInvoiceId = sent.id;
      invoice.moneybirdUrl = sent.url;
    } catch (error) {
      console.error(`[billing] Moneybird for ${invoice.number} failed:`, error instanceof Error ? error.message : error);
    }
  }
  // Client (31 Oct): Mollie only for one-off payments of homepage ads.
  if (mollieEnabled() && input.checkout) {
    try {
      const payment = await createMolliePayment({
        amountCents: invoice.total,
        description: `${invoice.number} – ${invoice.description}`,
        redirectUrl: `${env.dashboardUrl}${invoicesLink(input.owner)}?paid=${invoice.number}`,
        metadata: { invoice: String(invoice._id) },
      });
      invoice.molliePaymentId = payment.id;
      invoice.paymentUrl = payment._links.checkout?.href ?? "";
    } catch (error) {
      console.error(`[billing] Mollie for ${invoice.number} failed:`, error instanceof Error ? error.message : error);
    }
  }
  await invoice.save();

  if (input.notify !== false) {
    await notifyOwner(input.owner, `New invoice ${invoice.number}`, `${input.description} — €${euros(invoice.total)} incl. VAT`, invoicesLink(input.owner));
  }
  return invoice;
}

/**
 * Marks an invoice paid and starts what it paid for (an ad goes into the
 * queue; paid commission lifts a block). `source` tells where the payment came from.
 */
export async function markInvoicePaid(invoice: IInvoice, source: "mollie" | "moneybird" | "admin", date = new Date()) {
  if (invoice.status === "paid") return invoice;
  invoice.status = "paid";
  invoice.paidAt = date;
  await invoice.save();

  if (invoice.moneybirdInvoiceId && source !== "moneybird" && moneybirdEnabled()) {
    await registerMoneybirdPayment(invoice.moneybirdInvoiceId, invoice.total, date).catch((error) =>
      console.error(`[billing] Moneybird payment for ${invoice.number}:`, error instanceof Error ? error.message : error)
    );
  }

  if (invoice.kind === "commission" && invoice.supplier) await unblockIfSettled(invoice.supplier);
  // Lazy import: the ads module creates invoices itself.
  if (invoice.kind === "advertising" && invoice.reference) {
    const { onAdPaid } = await import("./ads");
    await onAdPaid(invoice.reference);
  }

  const owner: Owner = invoice.hotel ? { hotel: invoice.hotel } : { supplier: invoice.supplier! };
  await notifyOwner(owner, `Payment received for ${invoice.number}`, `Thank you! €${euros(invoice.total)} was paid.`, invoicesLink(owner));
  return invoice;
}

export async function cancelInvoice(invoice: IInvoice) {
  if (invoice.status === "paid") throw new Error("A paid invoice cannot be cancelled");
  invoice.status = "cancelled";
  await invoice.save();
  return invoice;
}

// ── Memberships ──────────────────────────────────────────────────────────────
// Master Briefing v4 / agreements (13 Nov 2026): one year at a time, billed in
// advance. Hotels pay by number of rooms; Founding Hotels get the first 12
// months free and keep their price; suppliers are free until 1 May 2028.

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  hotel: "HotelConnect membership (hotel)",
  "supplier-contract": "HotelConnect membership (Maintenance Partner)",
  "supplier-project": "HotelConnect membership (Project & Capex Partner)",
};

const addMonths = (d: Date, months: number) => addInterval(d, "month", months);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const ownerOf = (sub: ISubscription): Owner => (sub.hotel ? { hotel: sub.hotel } : { supplier: sub.supplier! });

/** The yearly price of the next paid period (cents, excl. VAT). */
export async function yearlyPrice(sub: ISubscription) {
  if (sub.plan !== "hotel") return SUPPLIER_PRICES[sub.plan].year;
  if (sub.lockedPrice != null) return sub.lockedPrice;
  const hotel = await Hotel.findById(sub.hotel).select("facilities.rooms").lean();
  return hotelTier(hotel?.facilities?.rooms).price;
}

async function invoicePeriod(sub: ISubscription) {
  const price = await yearlyPrice(sub);
  // A founding hotel's price is not raised afterwards (Founding agreement §5.2).
  if (sub.plan === "hotel" && sub.tier === "founding" && sub.lockedPrice == null) {
    sub.lockedPrice = price;
    await sub.save();
  }
  const label = `${PLAN_LABELS[sub.plan]}, ${fmt(sub.currentPeriodStart)} – ${fmt(sub.currentPeriodEnd)}`;
  return createInvoice({
    owner: ownerOf(sub),
    kind: "membership",
    description: label,
    lines: [{ description: label, unitPrice: price }],
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    reference: sub._id as Id,
    paymentMethod: sub.paymentMethod,
  });
}

/** Free period of a new membership: founding hotel 12 months, suppliers until 1 May 2028. */
async function freeUntilFor(owner: Owner, plan: SubscriptionPlan, start: Date) {
  if (plan !== "hotel") return SUPPLIER_FREE_UNTIL > start ? SUPPLIER_FREE_UNTIL : null;
  const hotel = await Hotel.findById((owner as { hotel: Id }).hotel).select("foundingMember").lean();
  return hotel?.foundingMember ? addMonths(start, FOUNDING_FREE_MONTHS) : null;
}

/**
 * Starts a membership now. In a free period no invoice is raised; the first
 * yearly invoice comes when it ends. One active membership per member.
 */
export async function startSubscription(owner: Owner, plan: SubscriptionPlan, options: { paymentMethod?: PaymentMethod } = {}) {
  const existing = await Subscription.findOne({ ...owner, status: "active" });
  if (existing) return existing;
  const start = new Date();
  const freeUntil = await freeUntilFor(owner, plan, start);
  const hotel = "hotel" in owner ? await Hotel.findById(owner.hotel).select("foundingMember").lean() : null;
  const sub = await Subscription.create({
    ...owner,
    plan,
    interval: "year",
    tier: hotel?.foundingMember ? "founding" : "standard",
    paymentMethod: options.paymentMethod ?? "sepa",
    freeUntil,
    currentPeriodStart: start,
    currentPeriodEnd: freeUntil ?? addInterval(start, "year"),
  });
  if (!freeUntil) await invoicePeriod(sub);
  return sub;
}

/** SEPA direct debit (default) or paying each invoice by hand; applies to the next invoice. */
export async function changePaymentMethod(sub: ISubscription, paymentMethod: PaymentMethod) {
  sub.paymentMethod = paymentMethod;
  await sub.save();
  return sub;
}

/**
 * Admin: marks a hotel as one of the first 10 Founding Hotels (or not). A
 * founding hotel's first 12 months after activation are free: an open
 * membership invoice in that time is cancelled.
 */
export async function setFoundingMember(owner: Owner, founding: boolean) {
  if ("hotel" in owner) await Hotel.updateOne({ _id: owner.hotel }, { foundingMember: founding });
  else await Supplier.updateOne({ _id: owner.supplier }, { foundingMember: founding });
  const sub = await Subscription.findOne({ ...owner, status: "active" });
  if (!sub || sub.plan !== "hotel") return sub;
  sub.tier = founding ? "founding" : "standard";
  const freeEnd = addMonths(sub.startedAt, FOUNDING_FREE_MONTHS);
  if (founding && freeEnd > new Date()) {
    sub.freeUntil = freeEnd;
    sub.currentPeriodStart = sub.startedAt;
    sub.currentPeriodEnd = freeEnd;
    const open = await Invoice.find({ reference: sub._id, kind: "membership", status: "open" });
    for (const invoice of open) await cancelInvoice(invoice);
  } else if (!founding) {
    sub.freeUntil = null;
    sub.lockedPrice = null;
  }
  await sub.save();
  return sub;
}

/**
 * Cancelling (agreements §6): free periods end straight away; otherwise at
 * least NOTICE_MONTHS before the end of the contract year, or the membership
 * runs one more year. Paid fees are not refunded; access stays until the end.
 */
export async function cancelSubscription(sub: ISubscription, now = new Date()) {
  const inFreePeriod = sub.freeUntil && sub.freeUntil > now;
  let endsAt: Date;
  if (inFreePeriod && sub.plan !== "hotel") endsAt = now; // suppliers: free to leave any time before 1 May 2028
  else if (addMonths(now, NOTICE_MONTHS) <= sub.currentPeriodEnd) endsAt = sub.currentPeriodEnd;
  else endsAt = addInterval(sub.currentPeriodEnd, "year");
  sub.status = "cancelled";
  sub.cancelledAt = now;
  sub.endsAt = endsAt;
  await sub.save();
  if (endsAt <= now) await endMembership(sub);
  return sub;
}

/** The membership is over: the account is switched off. */
async function endMembership(sub: ISubscription) {
  if (sub.hotel) await Hotel.updateOne({ _id: sub.hotel }, { isActive: false });
  else await Supplier.updateOne({ _id: sub.supplier }, { isActive: false });
}

/**
 * Scheduler: rolls every active membership whose period ended into the next
 * year with a new invoice (the first one after a free period too), and ends
 * cancelled memberships whose last day has passed.
 */
export async function renewSubscriptions(now = new Date()) {
  const due = await Subscription.find({
    currentPeriodEnd: { $lte: now },
    $or: [{ status: "active" }, { status: "cancelled", endsAt: { $gt: now } }],
  });
  let renewed = 0;
  for (const sub of due) {
    while (sub.currentPeriodEnd <= now) {
      sub.currentPeriodStart = sub.currentPeriodEnd;
      sub.currentPeriodEnd = addInterval(sub.currentPeriodStart, "year");
    }
    await sub.save();
    await invoicePeriod(sub);
    renewed += 1;
  }
  const ending = await Subscription.find({ status: "cancelled", endsAt: { $lte: now }, endedAt: { $exists: false } });
  for (const sub of ending) {
    await endMembership(sub);
    sub.set("endedAt", now);
    await sub.save();
  }
  return { renewed, ended: ending.length };
}

/** Scheduler: invoices paid in Moneybird (SEPA, bank transfer, payment link) become paid here too. */
export async function syncMoneybirdPayments() {
  if (!moneybirdEnabled()) return { paid: 0 };
  const open = await Invoice.find({ status: "open", moneybirdInvoiceId: { $ne: "" } }).limit(200);
  let paid = 0;
  for (const invoice of open) {
    try {
      if ((await getMoneybirdInvoiceState(invoice.moneybirdInvoiceId!)) === "paid") {
        await markInvoicePaid(invoice, "moneybird");
        paid += 1;
      }
    } catch (error) {
      console.error(`[billing] Moneybird state of ${invoice.number}:`, error instanceof Error ? error.message : error);
    }
  }
  return { paid };
}

// ── Commission ───────────────────────────────────────────────────────────────

/**
 * Suppliers without a maintenance contract pay commission only when they win
 * an assignment: COMMISSION_PERCENT of the winning quote, at most
 * COMMISSION_MAX, invoiced right after the award with a 30-day term.
 */
export async function chargeCommission(input: { supplierId: Id; tenderId: Id; tenderTitle: string; offerPriceCents: number }) {
  // Master Briefing v4: 0% commission — nothing is charged while switched off.
  if (!COMMISSION_ENABLED) return null;
  const supplier = await Supplier.findById(input.supplierId).select("plan").lean();
  if (!supplier || supplier.plan === "contract") return null;
  const amount = Math.min(Math.round((input.offerPriceCents * COMMISSION_PERCENT) / 100), COMMISSION_MAX);
  if (amount <= 0) return null;
  const capped = amount === COMMISSION_MAX ? ` — maximum €${euros(COMMISSION_MAX)}` : "";
  const label = `Commission ${COMMISSION_PERCENT}% on "${input.tenderTitle}" (quote €${euros(input.offerPriceCents)})${capped}`;
  return createInvoice({
    owner: { supplier: input.supplierId },
    kind: "commission",
    description: label,
    lines: [{ description: label, unitPrice: amount }],
    reference: input.tenderId,
    dueInDays: COMMISSION_PAYMENT_TERM_DAYS,
  });
}

/**
 * Scheduler: unpaid commission. Counted from the invoice date: a reminder
 * after 30 days, a second one after 44, and after 51 days collection starts
 * and the supplier is blocked (directory shows only the name). Paying lifts
 * the block (see markInvoicePaid).
 */
export async function runCommissionDunning(now = new Date()) {
  if (!COMMISSION_ENABLED) return { reminders: 0, blocked: 0 };
  const overdue = await Invoice.find({ kind: "commission", status: "open", issuedAt: { $lte: new Date(now.getTime() - COMMISSION_DUNNING_DAYS.reminder * DAY) } });
  let reminders = 0;
  let blocked = 0;
  for (const invoice of overdue) {
    const age = (now.getTime() - invoice.issuedAt.getTime()) / DAY;
    const dunning = invoice.dunning ?? {};
    const supplierId = String(invoice.supplier);
    const amount = `€${euros(invoice.total)}`;
    if (age >= COMMISSION_DUNNING_DAYS.block && !dunning.blockedAt) {
      await Supplier.updateOne({ _id: invoice.supplier }, { blocked: true });
      invoice.set("dunning.blockedAt", now);
      await notifySupplier(supplierId, {
        type: "system",
        title: `Invoice ${invoice.number} handed over for collection`,
        body: `${amount} is still unpaid. Your website link is hidden in the directory until it is paid.`,
        link: "/supplier/invoices",
      });
      await emailAdmins(
        `Commission ${invoice.number} unpaid after ${COMMISSION_DUNNING_DAYS.block} days`,
        `<p>Invoice <strong>${escapeHtml(invoice.number)}</strong> (${amount}) is unpaid after ${COMMISSION_DUNNING_DAYS.block} days. The supplier is blocked in the directory; start collection.</p>`
      );
      blocked += 1;
    } else if (age >= COMMISSION_DUNNING_DAYS.secondReminder && !dunning.secondReminderAt) {
      invoice.set("dunning.secondReminderAt", now);
      await notifySupplier(supplierId, { type: "system", title: `Second reminder: invoice ${invoice.number}`, body: `${amount} is overdue. Without payment we start collection and hide your website link in the directory.`, link: "/supplier/invoices" });
      reminders += 1;
    } else if (!dunning.reminderAt) {
      invoice.set("dunning.reminderAt", now);
      await notifySupplier(supplierId, { type: "system", title: `Reminder: invoice ${invoice.number}`, body: `${amount} was due. Please pay it soon.`, link: "/supplier/invoices" });
      reminders += 1;
    } else continue;
    await invoice.save();
  }
  return { reminders, blocked };
}

/** Lifts the block once a supplier has no blocked commission invoices left. */
async function unblockIfSettled(supplierId: Id) {
  const stillBlocked = await Invoice.exists({ supplier: supplierId, kind: "commission", status: "open", "dunning.blockedAt": { $ne: null } });
  if (!stillBlocked) await Supplier.updateOne({ _id: supplierId }, { blocked: false });
}

async function emailAdmins(subject: string, html: string) {
  const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("email").lean();
  await Promise.all(admins.map((a) => sendEmail({ to: a.email, subject, html }).catch(() => undefined)));
}
