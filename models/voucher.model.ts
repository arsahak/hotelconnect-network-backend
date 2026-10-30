import mongoose, { Schema, Document } from "mongoose";
import { REGIONS, VOUCHER_CATEGORIES } from "../config/constants";

/**
 * A corporate voucher: a hotel's deal for business guests (briefing §2.4,
 * §2.5, §3.10). The teaser is public; the booking link is only given to a
 * valid supplier member number.
 */
export interface IVoucher extends Document {
  hotel: mongoose.Types.ObjectId;
  title: string;
  teaser: string;
  description: string;
  image: string;
  imageKey?: string;
  discountPercent: number;
  category: string;
  region: string;
  bookingUrl: string;
  isActive: boolean;
  /** Paid promotion: shown first in the slideshow until this date. */
  promotedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     VoucherTeaser:
 *       type: object
 *       description: What everyone sees in the slideshow (no booking link)
 *       properties:
 *         _id: { type: string }
 *         title: { type: string, example: Meeting day package }
 *         teaser: { type: string }
 *         image: { type: string }
 *         discountPercent: { type: number, example: 20 }
 *         category: { type: string, example: Meeting }
 *         region: { type: string, example: Utrecht }
 *         hotel:
 *           type: object
 *           properties:
 *             name: { type: string }
 *             city: { type: string }
 *     Voucher:
 *       allOf:
 *         - $ref: '#/components/schemas/VoucherTeaser'
 *         - type: object
 *           properties:
 *             description: { type: string }
 *             bookingUrl: { type: string }
 */
const voucherSchema = new Schema<IVoucher>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    teaser: { type: String, trim: true, default: "", maxlength: 200 },
    description: { type: String, trim: true, default: "", maxlength: 2000 },
    image: { type: String, trim: true, default: "" },
    imageKey: { type: String, trim: true, default: "" },
    discountPercent: {
      type: Number,
      required: [true, "Discount percentage is required"],
      min: [1, "Discount must be at least 1%"],
      max: [100, "Discount can be at most 100%"],
    },
    category: { type: String, enum: VOUCHER_CATEGORIES, required: [true, "Category is required"] },
    region: { type: String, enum: REGIONS, required: true },
    bookingUrl: { type: String, required: [true, "Booking link is required"], trim: true },
    isActive: { type: Boolean, default: true },
    promotedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export const VOUCHER_TEASER_FIELDS = "title teaser image discountPercent category region hotel promotedUntil createdAt";
export const VOUCHER_MEMBER_FIELDS = `${VOUCHER_TEASER_FIELDS} description bookingUrl`;

export const Voucher = mongoose.model<IVoucher>("Voucher", voucherSchema);
