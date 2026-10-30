import type mongoose from "mongoose";
import { PERIOD_MONTHS, PROMOTION_PRICES, type AdPeriod } from "../config/billing";
import { Voucher } from "../models/voucher.model";
import { ApiError } from "../utils/ApiError";
import { notifyHotel } from "../utils/notify";
import { addInterval, createInvoice } from "./billing";

type Id = mongoose.Types.ObjectId | string;

/**
 * "Promoot je voucher" (briefing §3.10): the hotel picks a month or quarter
 * and pays; the voucher then comes first in the suppliers-page slideshow and
 * drops back by itself when the time is up (the slideshow reads promotedUntil).
 */
export async function createPromotionCheckout(hotelId: Id, voucherId: Id, period: AdPeriod) {
  const voucher = await Voucher.findOne({ _id: voucherId, hotel: hotelId }).select("title isActive").lean();
  if (!voucher) throw new ApiError(404, "Voucher not found");
  if (!voucher.isActive) throw new ApiError(409, "Switch the voucher on before promoting it");
  const label = `Voucher promotion "${voucher.title}", 1 ${period}`;
  return createInvoice({
    owner: { hotel: hotelId },
    kind: "promotion",
    description: label,
    lines: [{ description: label, unitPrice: PROMOTION_PRICES[period] }],
    reference: voucherId,
    meta: { period },
    checkout: true,
    notify: false,
  });
}

/** Billing calls this once paid: extends promotedUntil from today, or from the current end. */
export async function onPromotionPaid(voucherId: Id, period: AdPeriod) {
  const voucher = await Voucher.findById(voucherId);
  if (!voucher) return;
  const now = new Date();
  const from = voucher.promotedUntil && voucher.promotedUntil > now ? voucher.promotedUntil : now;
  voucher.promotedUntil = addInterval(from, "month", PERIOD_MONTHS[period]);
  await voucher.save();
  await notifyHotel(String(voucher.hotel), {
    type: "advertising",
    title: `"${voucher.title}" is promoted`,
    body: `It comes first in the voucher slideshow until ${voucher.promotedUntil.toISOString().slice(0, 10)}.`,
    link: `/hotel/vouchers/${voucher._id}`,
  });
}
