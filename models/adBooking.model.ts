import mongoose, { Schema, Document } from "mongoose";
import { AD_BLOCKS, AD_PERIODS, type AdBlock, type AdPeriod } from "../config/billing";

export const AD_STATUSES = ["pending_payment", "queued", "live", "ended", "cancelled"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/**
 * A paid "Sponsored" spot in one of the homepage blocks (briefing §2.1,
 * §3.15, §4.9). Per block and position one ad is live at a time; paid ads
 * wait in line (waitlist) and go live by themselves when the spot frees up.
 */
export interface IAdBooking extends Document {
  block: AdBlock;
  position: number;
  period: AdPeriod;
  hotel?: mongoose.Types.ObjectId | null;
  supplier?: mongoose.Types.ObjectId | null;
  /** For the jobs block: the hotel's vacancy that is promoted. */
  vacancy?: mongoose.Types.ObjectId | null;
  status: AdStatus;
  invoice?: mongoose.Types.ObjectId | null;
  paidAt?: Date | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const adBookingSchema = new Schema<IAdBooking>(
  {
    block: { type: String, enum: AD_BLOCKS, required: true },
    position: { type: Number, required: true, min: 1 },
    period: { type: String, enum: AD_PERIODS, required: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
    vacancy: { type: Schema.Types.ObjectId, ref: "Vacancy", default: null },
    status: { type: String, enum: AD_STATUSES, default: "pending_payment", index: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    paidAt: { type: Date, default: null },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adBookingSchema.index({ block: 1, position: 1, status: 1, paidAt: 1 });

export const AdBooking = mongoose.model<IAdBooking>("AdBooking", adBookingSchema);
