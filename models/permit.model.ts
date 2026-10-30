import mongoose, { Schema, Document } from "mongoose";

/**
 * Permits and certificates (briefing §3.4.4). All fields optional except
 * the type; a reminder goes out 30 days before the expiry date.
 */
export interface IPermit extends Document {
  hotel: mongoose.Types.ObjectId;
  type: string;
  authority?: string;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  documentLink?: string;
  notes?: string;
  /** The expiry date a reminder email was already sent for (utils/reminders.ts). */
  reminderSentFor?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Permit:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         type: { type: string, example: Liquor licence }
 *         authority: { type: string, example: Gemeente Amsterdam }
 *         issueDate: { type: string, format: date }
 *         expiryDate: { type: string, format: date }
 *         documentLink: { type: string }
 *         notes: { type: string }
 */
const permitSchema = new Schema<IPermit>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    type: { type: String, required: [true, "Type of permit or certificate is required"], trim: true, maxlength: 120 },
    authority: { type: String, trim: true, default: "", maxlength: 120 },
    issueDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    documentLink: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    reminderSentFor: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

export const Permit = mongoose.model<IPermit>("Permit", permitSchema);
