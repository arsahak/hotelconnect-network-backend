import type mongoose from "mongoose";
import { AD_BLOCKS, AD_BLOCKS_FOR, AD_PERIOD_DAYS, AD_POSITIONS, AD_PRICES, type AdBlock, type AdPeriod } from "../config/billing";
import { AdBooking, type IAdBooking } from "../models/adBooking.model";
import { Hotel, HOTEL_PUBLIC_FIELDS, LISTED_HOTEL } from "../models/hotel.model";
import { Invoice } from "../models/invoice.model";
import { publicSupplier, Supplier, SUPPLIER_PUBLIC_FIELDS } from "../models/supplier.model";
import { Vacancy, VACANCY_PUBLIC_FIELDS } from "../models/vacancy.model";
import { ApiError } from "../utils/ApiError";
import { notifyHotel, notifySupplier } from "../utils/notify";
import { cancelInvoice, createInvoice, type Owner } from "./billing";

type Id = mongoose.Types.ObjectId | string;

const BLOCK_LABELS: Record<AdBlock, string> = { suppliers: "Suppliers", jobs: "Jobs", hotels: "Hotels" };
const PERIOD_LABELS: Record<AdPeriod, string> = { fortnight: "14 days", month: "1 month (2 × 14 days)" };
const DAY = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const ownerOf = (b: IAdBooking): Owner => (b.hotel ? { hotel: b.hotel } : { supplier: b.supplier! });
const adsLink = (b: IAdBooking) => (b.hotel ? "/hotel/advertising" : "/supplier/advertising");

async function notifyOwner(b: IAdBooking, title: string, body: string) {
  const melding = { type: "advertising" as const, title, body, link: adsLink(b) };
  if (b.hotel) await notifyHotel(String(b.hotel), melding);
  else await notifySupplier(String(b.supplier), melding);
}

/** Per block and position: the live ad, how many are waiting, and when a new booking would start. */
export async function adAvailability(now = new Date()) {
  const active = await AdBooking.find({ status: { $in: ["live", "queued"] } }).sort({ paidAt: 1 }).lean();
  return AD_BLOCKS.map((block) => ({
    block,
    prices: AD_PRICES[block],
    positions: Array.from({ length: AD_POSITIONS }, (_, i) => {
      const position = i + 1;
      const here = active.filter((b) => b.block === block && b.position === position);
      const live = here.find((b) => b.status === "live");
      const queued = here.filter((b) => b.status === "queued");
      // A new booking starts after the live one and everything already waiting.
      let nextStart = live?.endsAt ? new Date(live.endsAt) : now;
      for (const q of queued) nextStart = addDays(nextStart, AD_PERIOD_DAYS[q.period]);
      return { position, liveUntil: live?.endsAt ?? null, waiting: queued.length, nextStart: nextStart < now ? now : nextStart };
    }),
  }));
}

/**
 * Books a spot: suppliers promote their profile (suppliers block), hotels
 * their hotel (hotels block) or one of their published jobs (jobs block).
 * Returns the booking and its invoice (with a Mollie checkout when available).
 */
export async function createAdBooking(input: { owner: Owner; block: AdBlock; position: number; period: AdPeriod; vacancyId?: string }) {
  const ownerType = "hotel" in input.owner ? "hotel" : "supplier";
  if (!(AD_BLOCKS_FOR[ownerType] as readonly string[]).includes(input.block)) {
    throw new ApiError(422, ownerType === "hotel" ? "Hotels can book the hotels or jobs block" : "Suppliers can book the suppliers block");
  }
  if (input.position < 1 || input.position > AD_POSITIONS) throw new ApiError(422, "Unknown position");

  let vacancy: Id | null = null;
  if (input.block === "jobs") {
    const job = await Vacancy.findOne({ _id: input.vacancyId, hotel: (input.owner as { hotel: Id }).hotel, status: "published" }).select("_id title").lean();
    if (!job) throw new ApiError(422, "Choose one of your published jobs");
    vacancy = job._id as Id;
  }

  const booking = await AdBooking.create({ ...input.owner, block: input.block, position: input.position, period: input.period, vacancy });
  const label = `Sponsored spot: ${BLOCK_LABELS[input.block]} block, position ${input.position}, ${PERIOD_LABELS[input.period]}`;
  const invoice = await createInvoice({
    owner: input.owner,
    kind: "advertising",
    description: label,
    lines: [{ description: label, unitPrice: AD_PRICES[input.block][input.period] }],
    reference: booking._id as Id,
    checkout: true,
    notify: false,
  });
  booking.invoice = invoice._id as mongoose.Types.ObjectId;
  await booking.save();
  return { booking, invoice };
}

/** Billing calls this when the invoice is paid: the ad joins the line and goes live if the spot is free. */
export async function onAdPaid(bookingId: Id) {
  const booking = await AdBooking.findById(bookingId);
  if (!booking || booking.status !== "pending_payment") return;
  booking.status = "queued";
  booking.paidAt = new Date();
  await booking.save();
  const wentLive = await advanceQueue(booking.block, booking.position);
  if (!wentLive.includes(String(booking._id))) {
    await notifyOwner(booking, "Your ad is in line", `Paid — it goes live as soon as position ${booking.position} in the ${BLOCK_LABELS[booking.block]} block is free.`);
  }
}

/** Puts the next paid ad live when the spot is free. Returns the ids that went live. */
async function advanceQueue(block: AdBlock, position: number, now = new Date()) {
  if (await AdBooking.exists({ block, position, status: "live" })) return [];
  const next = await AdBooking.findOne({ block, position, status: "queued" }).sort({ paidAt: 1 });
  if (!next) return [];
  next.status = "live";
  next.startsAt = now;
  next.endsAt = addDays(now, AD_PERIOD_DAYS[next.period]);
  await next.save();
  await notifyOwner(next, "Your ad is live", `Shown as "Sponsored" in the ${BLOCK_LABELS[block]} block until ${next.endsAt.toISOString().slice(0, 10)}.`);
  return [String(next._id)];
}

/** Scheduler (briefing §6 "reclame-rotatie"): ends ads whose time is up and lets the next one in. */
export async function rotateAds(now = new Date()) {
  const ended = await AdBooking.find({ status: "live", endsAt: { $lte: now } });
  for (const ad of ended) {
    ad.status = "ended";
    await ad.save();
    await notifyOwner(ad, "Your ad has ended", `Your sponsored spot in the ${BLOCK_LABELS[ad.block]} block has ended. Book again any time.`);
  }
  let started = 0;
  for (const block of AD_BLOCKS) {
    for (let position = 1; position <= AD_POSITIONS; position++) started += (await advanceQueue(block, position, now)).length;
  }
  return { ended: ended.length, started };
}

/** An unpaid booking can be cancelled; its invoice is cancelled too. */
export async function cancelAdBooking(owner: Owner, id: Id) {
  const booking = await AdBooking.findOne({ _id: id, ...owner });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.status !== "pending_payment") throw new ApiError(409, "Only an unpaid booking can be cancelled");
  booking.status = "cancelled";
  await booking.save();
  if (booking.invoice) {
    const invoice = await Invoice.findById(booking.invoice);
    if (invoice && invoice.status === "open") await cancelInvoice(invoice);
  }
  return booking;
}

/** What the homepage shows as "Sponsored", per block, position 1 first. */
export async function liveSponsored() {
  const live = await AdBooking.find({ status: "live" }).sort({ position: 1 }).lean();
  const ids = (key: "hotel" | "supplier" | "vacancy", block: AdBlock) => live.filter((b) => b.block === block).map((b) => b[key]).filter(Boolean);
  const [suppliers, hotels, jobs] = await Promise.all([
    Supplier.find({ _id: { $in: ids("supplier", "suppliers") }, isActive: true }).select(SUPPLIER_PUBLIC_FIELDS).lean(),
    Hotel.find({ _id: { $in: ids("hotel", "hotels") }, ...LISTED_HOTEL }).select(HOTEL_PUBLIC_FIELDS).lean(),
    Vacancy.find({ _id: { $in: ids("vacancy", "jobs") }, status: "published" }).select(VACANCY_PUBLIC_FIELDS).populate("hotel", "name slug city image").lean(),
  ]);
  const inOrder = <T extends { _id: unknown }>(items: T[], key: "hotel" | "supplier" | "vacancy", block: AdBlock) =>
    ids(key, block).map((id) => items.find((i) => String(i._id) === String(id))).filter((i): i is T => Boolean(i));
  return { suppliers: inOrder(suppliers, "supplier", "suppliers").map(publicSupplier), hotels: inOrder(hotels, "hotel", "hotels"), jobs: inOrder(jobs, "vacancy", "jobs") };
}
