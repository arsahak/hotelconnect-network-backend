import mongoose, { Schema, Document } from "mongoose";

export const PURCHASE_STATUSES = ["open", "negotiating", "completed"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** How long the hotels' invoices are kept after an action is completed (briefing §3.13, AVG). */
export const PURCHASE_FILE_RETENTION_DAYS = 90;

/**
 * A collective purchasing action (briefing §3.13), e.g. "Collectieve
 * energie-inkoop 2027". Hotels join with their latest annual invoice; once
 * enough hotels joined, HotelConnect negotiates with suppliers.
 */
export interface IPurchaseAction extends Document {
  title: string;
  /** For now always energy; later keycards, fuel and more. */
  category: string;
  description: string;
  status: PurchaseStatus;
  /** At this number of participants the status turns to "negotiating". */
  targetParticipants: number;
  deadline: Date;
  /** e.g. "10–15% on your energy bill". */
  expectedSavings: string;
  completedAt?: Date | null;
  /** Set once the invoices were deleted after completion. */
  filesDeletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     PurchaseAction:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string, example: Collectieve energie-inkoop 2027 }
 *         category: { type: string, example: Energy }
 *         description: { type: string }
 *         status: { type: string, enum: [open, negotiating, completed] }
 *         targetParticipants: { type: integer, example: 10 }
 *         deadline: { type: string, format: date }
 *         expectedSavings: { type: string, example: 10–15% on your energy bill }
 */
const purchaseActionSchema = new Schema<IPurchaseAction>(
  {
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 120 },
    category: { type: String, trim: true, default: "Energy", maxlength: 60 },
    description: { type: String, trim: true, default: "", maxlength: 3000 },
    status: { type: String, enum: PURCHASE_STATUSES, default: "open", index: true },
    targetParticipants: { type: Number, min: 1, max: 1000, default: 10 },
    deadline: { type: Date, required: [true, "Deadline is required"] },
    expectedSavings: { type: String, trim: true, default: "", maxlength: 120 },
    completedAt: { type: Date, default: null },
    filesDeletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** Hotels can join until the end of the deadline day, while the action is open. */
export function isJoinable(action: Pick<IPurchaseAction, "status" | "deadline">, now = new Date()) {
  const end = new Date(action.deadline);
  end.setUTCHours(23, 59, 59, 999);
  return action.status === "open" && now <= end;
}

export const PurchaseAction = mongoose.model<IPurchaseAction>("PurchaseAction", purchaseActionSchema);
