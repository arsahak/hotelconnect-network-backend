import type mongoose from "mongoose";
import { env } from "../config/env";
import {
  COMMISSION_PERCENT,
  euros,
  PAYMENT_TERM_DAYS,
  SUBSCRIPTION_PRICES,
  VAT_RATE,
  type BillingInterval,
  type SubscriptionPlan,
} from "../config/billing";
import { Counter } from "../models/counter.model";
import { Hotel } from "../models/hotel.model";
import { Invoice, type IInvoice, type InvoiceKind } from "../models/invoice.model";
import { Subscription, type ISubscription } from "../models/subscription.model";
import { Supplier } from "../models/supplier.model";
import { notifyHotel, notifySupplier } from "../utils/notify";
import { createMolliePayment, mollieEnabled } from "./mollie";
import { createAndSendMoneybirdInvoice, ensureMoneybirdContact, getMoneybirdInvoiceState, moneybirdEnabled, registerMoneybirdPayment } from "./moneybird";

type Id = mongoose.Types.ObjectId | string;
export type Owner = { hotel: Id } | { supplier: Id };

const DAY = 24 * 60 * 60 * 1000;

/** HC-2026-0001, HC-2026-0002, … (one series per year). */
async function nextInvoiceNumber(date = new Date()) {
  const year = date.getUTCFullYear();
  const counter = await Counter.findByIdAndUpdate(`invoice-${year}`, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `HC-${year}-${String(counter!.seq).padStart(4, "0")}`;
}

export function addInterval(date: Date, interval: BillingInterval | "quarter", times = 1) {
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
 * - Moneybird configured → created and emailed from Moneybird (its payment methods);
 * - `checkout` or no Moneybird → a Mollie payment link, when Mollie is configured;
 * - neither → stays open; an admin marks it paid once the money is in.
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
    dueDate: new Date(Date.now() + PAYMENT_TERM_DAYS * DAY),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    reference: input.reference ?? null,
    meta: input.meta ?? {},
  });

  const owner = await ownerDetails(input.owner);
  if (owner && moneybirdEnabled()) {
    try {
      const contactId = await ensureMoneybirdContact({ companyName: owner.name, email: owner.email, address: owner.address, city: owner.city, kvkNumber: owner.kvkNumber, customerId: owner.memberNumber });
      const sent = await createAndSendMoneybirdInvoice({ contactId, reference: invoice.number, lines });
      invoice.moneybirdInvoiceId = sent.id;
      invoice.moneybirdUrl = sent.url;
    } catch (error) {
      console.error(`[billing] Moneybird for ${invoice.number} failed:`, error instanceof Error ? error.message : error);
    }
  }
  if (mollieEnabled() && (input.checkout || !invoice.moneybirdInvoiceId)) {
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
 * queue, a voucher is promoted). `source` tells where the payment came from.
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

  // Lazy imports: these modules create invoices themselves.
  if (invoice.kind === "advertising" && invoice.reference) {
    const { onAdPaid } = await import("./ads");
    await onAdPaid(invoice.reference);
  }
  if (invoice.kind === "promotion" && invoice.reference) {
    const { onPromotionPaid } = await import("./promotions");
    await onPromotionPaid(invoice.reference, (invoice.meta?.period as "month" | "quarter") ?? "month");
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

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  hotel: "HotelConnect membership (hotel)",
  "supplier-contract": "HotelConnect membership (supplier with maintenance contract)",
};

function priceFor(plan: SubscriptionPlan, interval: BillingInterval) {
  const prices = SUBSCRIPTION_PRICES[plan] as Partial<Record<BillingInterval, number>>;
  const price = prices[interval];
  if (price === undefined) throw new Error(`No ${interval} price for ${plan}`);
  return price;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function invoicePeriod(sub: ISubscription) {
  const owner: Owner = sub.hotel ? { hotel: sub.hotel } : { supplier: sub.supplier! };
  const label = `${PLAN_LABELS[sub.plan]}, ${fmt(sub.currentPeriodStart)} – ${fmt(sub.currentPeriodEnd)}`;
  return createInvoice({
    owner,
    kind: "membership",
    description: label,
    lines: [{ description: label, unitPrice: priceFor(sub.plan, sub.interval) }],
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    reference: sub._id as Id,
  });
}

/** Starts a membership now and raises the first invoice. One active membership per member. */
export async function startSubscription(owner: Owner, plan: SubscriptionPlan, interval: BillingInterval) {
  priceFor(plan, interval);
  const existing = await Subscription.findOne({ ...owner, status: "active" });
  if (existing) return existing;
  const start = new Date();
  const sub = await Subscription.create({ ...owner, plan, interval, currentPeriodStart: start, currentPeriodEnd: addInterval(start, interval) });
  await invoicePeriod(sub);
  return sub;
}

/** Stops renewing; the paid period runs out. */
export async function cancelSubscription(sub: ISubscription) {
  sub.status = "cancelled";
  sub.cancelledAt = new Date();
  await sub.save();
  return sub;
}

/** Scheduler: rolls every active membership whose period ended into the next one, with a new invoice. */
export async function renewSubscriptions(now = new Date()) {
  const due = await Subscription.find({ status: "active", currentPeriodEnd: { $lte: now } });
  for (const sub of due) {
    while (sub.currentPeriodEnd <= now) {
      sub.currentPeriodStart = sub.currentPeriodEnd;
      sub.currentPeriodEnd = addInterval(sub.currentPeriodStart, sub.interval);
    }
    await sub.save();
    await invoicePeriod(sub);
  }
  return { renewed: due.length };
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
 * Price page: suppliers without a contract pay commission only when they win
 * a job — COMMISSION_PERCENT of the winning quote (excl. VAT).
 */
export async function chargeCommission(input: { supplierId: Id; tenderId: Id; tenderTitle: string; offerPriceCents: number }) {
  const supplier = await Supplier.findById(input.supplierId).select("plan").lean();
  if (!supplier || supplier.plan === "contract") return null;
  const amount = Math.round((input.offerPriceCents * COMMISSION_PERCENT) / 100);
  if (amount <= 0) return null;
  const label = `Commission ${COMMISSION_PERCENT}% on "${input.tenderTitle}" (quote €${euros(input.offerPriceCents)})`;
  return createInvoice({ owner: { supplier: input.supplierId }, kind: "commission", description: label, lines: [{ description: label, unitPrice: amount }], reference: input.tenderId });
}
