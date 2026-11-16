import mongoose, { Schema, Document } from "mongoose";
import { BILLING_INTERVALS, PAYMENT_METHODS, type BillingInterval, type PaymentMethod, type PriceTier, type SubscriptionPlan } from "../config/billing";

/**
 * A membership (prices in config/billing.ts, Master Briefing v4): hotels per
 * year by number of rooms, suppliers per year by plan. Founding hotels and
 * (until 1 May 2028) all suppliers start with a free period. The scheduler raises the next invoice when a
 * period ends; Moneybird collects it by SEPA direct debit, or the member pays
 * the invoice by hand (not Mollie Recurring).
 */
export interface ISubscription extends Document {
  hotel?: mongoose.Types.ObjectId | null;
  supplier?: mongoose.Types.ObjectId | null;
  plan: SubscriptionPlan;
  interval: BillingInterval;
  tier: PriceTier;
  paymentMethod: PaymentMethod;
  /** Free until this date (founding hotel: 12 months; suppliers: 1 May 2028). No invoice before it. */
  freeUntil?: Date | null;
  /** Founding hotels keep the yearly price of their first paid year. */
  lockedPrice?: number | null;
  /** Cancelled: the membership (and the account) ends on this date. */
  endsAt?: Date | null;
  /** Set when the scheduler ended the membership. */
  endedAt?: Date | null;
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
    plan: { type: String, enum: ["hotel", "supplier-contract", "supplier-project"], required: true },
    interval: { type: String, enum: BILLING_INTERVALS, required: true },
    tier: { type: String, enum: ["standard", "founding"], default: "standard" },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "sepa" },
    freeUntil: { type: Date, default: null },
    lockedPrice: { type: Number, default: null },
    endsAt: { type: Date, default: null },
    endedAt: { type: Date },
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    startedAt: { type: Date, default: () => new Date() },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>("Subscription", subscriptionSchema);
