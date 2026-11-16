import mongoose, { Schema, Document } from "mongoose";
import { EMAIL_REGEX } from "./user.model";

export const PARTNER_STATUSES = ["invited", "active"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/**
 * A hotel's trusted supplier (Master Briefing v4): the hotel sends a 1-click
 * invite (usually from a contract). Once the supplier is on HotelConnect the
 * link is "active" and the hotel shows under the supplier's My Partner Hotels.
 */
export interface IPartner extends Document {
  hotel: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId | null;
  company: string;
  email: string;
  contract: mongoose.Types.ObjectId | null;
  status: PartnerStatus;
  /** In the invite link; lets a supplier with another email address accept. */
  token: string;
  invitedAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const partnerSchema = new Schema<IPartner>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
    company: { type: String, trim: true, default: "", maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, match: [EMAIL_REGEX, "Please enter a valid email address"] },
    contract: { type: Schema.Types.ObjectId, ref: "Contract", default: null },
    status: { type: String, enum: PARTNER_STATUSES, default: "invited", index: true },
    token: { type: String, required: true, select: false, index: true },
    invitedAt: { type: Date, default: () => new Date() },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

partnerSchema.index({ hotel: 1, email: 1 }, { unique: true });

export const Partner = mongoose.model<IPartner>("Partner", partnerSchema);
