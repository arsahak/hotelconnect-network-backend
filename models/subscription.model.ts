import mongoose, { Schema, Document } from "mongoose";
import type { BillingInterval, SubscriptionPlan } from "../config/billing";

/**
 * A paid membership (price page): hotels €499/year; suppliers with a
 * maintenance contract €49/month or €539/year. The scheduler raises the next
 * invoice when a period ends; Moneybird collects it (not Mollie Recurring).
 */
export interface ISubscription extends Document {
  hotel?: mongoose.Types.ObjectId | null;
  supplier?: mongoose.Types.ObjectId | null;
  plan: SubscriptionPlan;
  interval: BillingInterval;
  status: "active" | "cancelled";
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** Cancelled subscriptions run until the end of the paid period. */
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
    plan: { type: String, enum: ["hotel", "supplier-contract"], required: true },
    interval: { type: String, enum: ["month", "year"], required: true },
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    startedAt: { type: Date, default: () => new Date() },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>("Subscription", subscriptionSchema);
