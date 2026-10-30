import mongoose, { Schema, Document } from "mongoose";
import { REGIONS, SUPPLIER_CATEGORIES, TENDER_TYPES, type TenderType } from "../config/constants";

export const TENDER_STATUSES = ["open", "awarded", "cancelled"] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

/**
 * A request from a hotel to suppliers (briefing §3.5 / §4.5): a tender, a
 * maintenance contract or a product request. It goes to at most three
 * suppliers with the same category and region; the hotel compares their
 * quotes and picks a winner.
 */
export interface ITender extends Document {
  hotel: mongoose.Types.ObjectId;
  type: TenderType;
  title: string;
  category: string;
  region: string;
  description: string;
  /** Last day suppliers can send a quote (the whole day counts). */
  deadline: Date;
  budget?: number | null;
  status: TenderStatus;
  /** The suppliers this tender was sent to. */
  invitedSuppliers: mongoose.Types.ObjectId[];
  /** The winning offer, once the hotel has chosen. */
  winner?: mongoose.Types.ObjectId | null;
  awardedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Tender:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         type: { type: string, enum: [Tender, Maintenance contract, Product request] }
 *         title: { type: string, example: New boiler for the spa }
 *         category: { type: string, example: Technical maintenance }
 *         region: { type: string, example: North Holland }
 *         description: { type: string }
 *         deadline: { type: string, format: date }
 *         budget: { type: number, example: 12000 }
 *         status: { type: string, enum: [open, awarded, cancelled] }
 */
const tenderSchema = new Schema<ITender>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    type: { type: String, enum: TENDER_TYPES, default: "Tender" },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    category: { type: String, enum: SUPPLIER_CATEGORIES, required: [true, "Category is required"] },
    region: { type: String, enum: REGIONS, required: [true, "Region is required"] },
    description: { type: String, required: [true, "Description is required"], trim: true, maxlength: 5000 },
    deadline: { type: Date, required: [true, "Deadline is required"] },
    budget: { type: Number, min: 0, default: null },
    status: { type: String, enum: TENDER_STATUSES, default: "open", index: true },
    invitedSuppliers: [{ type: Schema.Types.ObjectId, ref: "Supplier", index: true }],
    winner: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
    awardedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** Quotes are accepted until the end of the deadline day. */
export function isAcceptingOffers(tender: Pick<ITender, "status" | "deadline">, now = new Date()) {
  const end = new Date(tender.deadline);
  end.setUTCHours(23, 59, 59, 999);
  return tender.status === "open" && now <= end;
}

export const Tender = mongoose.model<ITender>("Tender", tenderSchema);
