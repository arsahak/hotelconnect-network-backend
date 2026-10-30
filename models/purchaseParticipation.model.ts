import mongoose, { Schema, Document } from "mongoose";

/**
 * A hotel taking part in a collective purchasing action (briefing §3.13).
 * The invoice PDF is private: only admins can download it, and it is deleted
 * after the action is completed.
 */
export interface IPurchaseParticipation extends Document {
  action: mongoose.Types.ObjectId;
  hotel: mongoose.Types.ObjectId;
  currentSupplier: string;
  contractEndDate: Date;
  /** Free text, e.g. "120.000 kWh, 30.000 m³ gas". */
  annualUsage: string;
  invoice?: { key: string; name: string; size: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

const participationSchema = new Schema<IPurchaseParticipation>(
  {
    action: { type: Schema.Types.ObjectId, ref: "PurchaseAction", required: true, index: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    currentSupplier: { type: String, required: [true, "Current supplier is required"], trim: true, maxlength: 120 },
    contractEndDate: { type: Date, required: [true, "Contract end date is required"] },
    annualUsage: { type: String, trim: true, default: "", maxlength: 200 },
    invoice: {
      type: new Schema({ key: String, name: String, size: Number }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);

participationSchema.index({ action: 1, hotel: 1 }, { unique: true });

// The storage key never leaves the API.
participationSchema.set("toJSON", {
  transform: (_doc, ret) => {
    if (ret.invoice) delete (ret.invoice as { key?: string }).key;
    return ret;
  },
});

export const PurchaseParticipation = mongoose.model<IPurchaseParticipation>("PurchaseParticipation", participationSchema);
