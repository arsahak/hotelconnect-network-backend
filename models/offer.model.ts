import mongoose, { Schema, Document } from "mongoose";

export const OFFER_STATUSES = ["submitted", "won", "lost"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * A supplier's quote for a tender (briefing §4.6): price, delivery time,
 * notes and one PDF or photo. One per supplier per tender; it can be changed
 * until the deadline.
 */
export interface IOffer extends Document {
  tender: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId;
  price: number;
  deliveryTime: string;
  notes: string;
  file?: { url: string; key: string; name: string } | null;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Offer:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         price: { type: number, example: 11500 }
 *         deliveryTime: { type: string, example: 3 weeks }
 *         notes: { type: string }
 *         file: { type: object, properties: { url: { type: string }, name: { type: string } } }
 *         status: { type: string, enum: [submitted, won, lost] }
 */
const offerSchema = new Schema<IOffer>(
  {
    tender: { type: Schema.Types.ObjectId, ref: "Tender", required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    price: { type: Number, required: [true, "Price is required"], min: 0 },
    deliveryTime: { type: String, trim: true, default: "", maxlength: 100 },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    file: {
      type: new Schema({ url: String, key: String, name: String }, { _id: false }),
      default: null,
    },
    status: { type: String, enum: OFFER_STATUSES, default: "submitted" },
  },
  { timestamps: true }
);

offerSchema.index({ tender: 1, supplier: 1 }, { unique: true });

offerSchema.set("toJSON", {
  transform: (_doc, ret) => {
    if (ret.file) delete (ret.file as { key?: string }).key;
    return ret;
  },
});

export const Offer = mongoose.model<IOffer>("Offer", offerSchema);
