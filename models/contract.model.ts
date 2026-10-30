import mongoose, { Schema, Document } from "mongoose";
import { NOTICE_UNITS, type NoticeUnit } from "../config/constants";

/**
 * Contract register (briefing §3.4.1). Every field is optional: a hotel that
 * only wants reminders fills in the end date and notice period; a hotel that
 * budgets with it also fills in the yearly cost and ledger account.
 */
export interface IContract extends Document {
  hotel: mongoose.Types.ObjectId;
  contractFor?: string;
  company?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  /** Free text, e.g. "3 years". */
  duration?: string;
  autoRenew: boolean;
  noticePeriod?: { value?: number | null; unit: NoticeUnit };
  paymentTerm?: string;
  costPerYear?: number | null;
  ledgerAccount?: string;
  contractLink?: string;
  portalLink?: string;
  notes?: string;
  /** The dates a reminder email was already sent for (utils/reminders.ts). */
  reminders: { endDate?: Date | null; noticeDeadline?: Date | null };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Contract:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         contractFor: { type: string, example: Energy }
 *         company: { type: string, example: GroenStroom Zakelijk }
 *         startDate: { type: string, format: date }
 *         endDate: { type: string, format: date }
 *         duration: { type: string, example: 3 years }
 *         autoRenew: { type: boolean }
 *         noticePeriod:
 *           type: object
 *           properties:
 *             value: { type: integer, example: 3 }
 *             unit: { type: string, enum: [days, weeks, months] }
 *         noticeDeadline: { type: string, format: date, description: "Last day to cancel (end date minus notice period, only with automatic renewal)" }
 *         paymentTerm: { type: string, example: Monthly }
 *         costPerYear: { type: number, example: 18400 }
 *         ledgerAccount: { type: string, example: "4410" }
 *         contractLink: { type: string }
 *         portalLink: { type: string }
 *         notes: { type: string }
 */
const contractSchema = new Schema<IContract>(
  {
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    contractFor: { type: String, trim: true, default: "", maxlength: 120 },
    company: { type: String, trim: true, default: "", maxlength: 120 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    duration: { type: String, trim: true, default: "", maxlength: 60 },
    autoRenew: { type: Boolean, default: false },
    noticePeriod: {
      value: { type: Number, min: 0, max: 1000, default: null },
      unit: { type: String, enum: NOTICE_UNITS, default: "months" },
    },
    paymentTerm: { type: String, trim: true, default: "", maxlength: 60 },
    costPerYear: { type: Number, min: 0, default: null },
    ledgerAccount: { type: String, trim: true, default: "", maxlength: 30 },
    contractLink: { type: String, trim: true, default: "" },
    portalLink: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    // A changed date no longer matches, so the new date gets its own reminder.
    reminders: {
      type: { endDate: { type: Date, default: null }, noticeDeadline: { type: Date, default: null } },
      default: () => ({}),
      select: false,
    },
  },
  { timestamps: true }
);

contractSchema.pre("validate", function (next) {
  if (!this.contractFor && !this.company) {
    this.invalidate("contractFor", "Fill in what the contract is for, or the company");
  }
  next();
});

/** Last day to cancel an automatically renewing contract. */
export function noticeDeadline(contract: Pick<IContract, "autoRenew" | "endDate" | "noticePeriod">): Date | null {
  const value = contract.noticePeriod?.value;
  if (!contract.autoRenew || !contract.endDate || !value) return null;
  const date = new Date(contract.endDate);
  const unit = contract.noticePeriod?.unit ?? "months";
  if (unit === "months") date.setMonth(date.getMonth() - value);
  else date.setDate(date.getDate() - value * (unit === "weeks" ? 7 : 1));
  return date;
}

contractSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => ({ ...ret, noticeDeadline: noticeDeadline(ret as unknown as IContract) }),
});

export const Contract = mongoose.model<IContract>("Contract", contractSchema);
