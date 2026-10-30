import mongoose, { Schema, Document } from "mongoose";
import { NOTIFICATION_TYPES, type NotificationType } from "../config/constants";

/**
 * A melding in the dashboard inbox (briefing §3.12, §4.4). It belongs to a
 * hotel (seen by the hotel manager) or to a supplier. Old ones are removed
 * after 180 days.
 */
export interface INotification extends Document {
  hotel?: mongoose.Types.ObjectId;
  supplier?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Dashboard path to open, e.g. /hotel/tenders/<id>. */
  link: string;
  readAt?: Date | null;
  createdAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         type: { type: string, enum: [compliance, tender, vacancy, fault, system, advertising] }
 *         title: { type: string }
 *         body: { type: string }
 *         link: { type: string, example: /hotel/tenders/656f1c2e8f1b2c0012a34567 }
 *         readAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 */
const notificationSchema = new Schema<INotification>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel" },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier" },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, default: "", maxlength: 1000 },
    link: { type: String, trim: true, default: "" },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ hotel: 1, createdAt: -1 });
notificationSchema.index({ supplier: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
