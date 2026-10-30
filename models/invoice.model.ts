import mongoose, { Schema, Document } from "mongoose";

export const INVOICE_KINDS = ["membership", "commission", "advertising", "promotion"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_STATUSES = ["open", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * Every invoice the platform raises (briefing "Betalingen en facturatie"):
 * memberships, commission, ads and voucher promotions. Amounts in cents.
 * With Moneybird configured the invoice is also created and sent there; a
 * one-off payment gets a Mollie checkout.
 */
export interface IInvoice extends Document {
  number: string;
  hotel?: mongoose.Types.ObjectId | null;
  supplier?: mongoose.Types.ObjectId | null;
  kind: InvoiceKind;
  description: string;
  lines: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  vat: number;
  total: number;
  status: InvoiceStatus;
  issuedAt: Date;
  dueDate: Date;
  paidAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  /** The thing this invoice pays for (subscription, ad booking, voucher, tender). */
  reference?: mongoose.Types.ObjectId | null;
  molliePaymentId?: string;
  paymentUrl?: string;
  moneybirdInvoiceId?: string;
  moneybirdUrl?: string;
  /** Extra details for what happens once paid, e.g. { period: "month" } for a promotion. */
  meta?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Invoice:
 *       type: object
 *       properties:
 *         number: { type: string, example: HC-2026-0001 }
 *         kind: { type: string, enum: [membership, commission, advertising, promotion] }
 *         description: { type: string }
 *         subtotal: { type: integer, description: cents excl. VAT }
 *         vat: { type: integer }
 *         total: { type: integer }
 *         status: { type: string, enum: [open, paid, cancelled] }
 *         dueDate: { type: string, format: date-time }
 *         paymentUrl: { type: string, description: Mollie checkout, when available }
 *         moneybirdUrl: { type: string, description: The invoice in Moneybird, when available }
 */
const invoiceSchema = new Schema<IInvoice>(
  {
    number: { type: String, required: true, unique: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
    kind: { type: String, enum: INVOICE_KINDS, required: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    lines: [
      new Schema({ description: String, quantity: { type: Number, default: 1 }, unitPrice: Number }, { _id: false }),
    ],
    subtotal: { type: Number, required: true },
    vat: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "open", index: true },
    issuedAt: { type: Date, default: () => new Date() },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    reference: { type: Schema.Types.ObjectId, default: null, index: true },
    molliePaymentId: { type: String, default: "", index: true },
    paymentUrl: { type: String, default: "" },
    moneybirdInvoiceId: { type: String, default: "" },
    moneybirdUrl: { type: String, default: "" },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model<IInvoice>("Invoice", invoiceSchema);
