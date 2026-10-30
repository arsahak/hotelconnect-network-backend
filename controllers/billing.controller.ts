import type { Request, Response } from "express";
import { AD_PRICES, COMMISSION_PERCENT, PROMOTION_PRICES, SUBSCRIPTION_PRICES, VAT_RATE } from "../config/billing";
import { Invoice } from "../models/invoice.model";
import { Subscription } from "../models/subscription.model";
import { Supplier } from "../models/supplier.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { cancelInvoice, cancelSubscription, markInvoicePaid, startSubscription, type Owner } from "../services/billing";
import { getMolliePayment, mollieEnabled } from "../services/mollie";
import { moneybirdEnabled } from "../services/moneybird";

// Facturen (briefing §3.9) and the admin side of billing.

/** The signed-in hotel manager's hotel, or supplier's supplier. */
function myOwner(req: Request): Owner {
  if (req.user!.role === "hotel_manager" && req.user!.hotel) return { hotel: req.user!.hotel };
  if (req.user!.role === "supplier" && req.user!.supplier) return { supplier: req.user!.supplier };
  throw new ApiError(403, "This account has no invoices");
}

const PUBLIC_INVOICE = "-meta -molliePaymentId -moneybirdInvoiceId";

/** GET /billing/mine — membership, invoices and prices for the signed-in member. */
export const myBilling = asyncHandler(async (req: Request, res: Response) => {
  const owner = myOwner(req);
  const [subscription, invoices, supplier] = await Promise.all([
    Subscription.findOne({ ...owner }).sort({ createdAt: -1 }).lean(),
    Invoice.find({ ...owner }).select(PUBLIC_INVOICE).sort({ issuedAt: -1 }).limit(100).lean(),
    "supplier" in owner ? Supplier.findById(owner.supplier).select("plan").lean() : null,
  ]);
  return ApiResponse(res, 200, "Billing fetched", {
    subscription,
    invoices,
    plan: supplier?.plan ?? null,
    prices: { subscriptions: SUBSCRIPTION_PRICES, commissionPercent: COMMISSION_PERCENT, vatRate: VAT_RATE, ads: AD_PRICES, promotions: PROMOTION_PRICES },
    online: { mollie: mollieEnabled(), moneybird: moneybirdEnabled() },
  });
});

/** PATCH /billing/mine/interval — suppliers with a contract: monthly or yearly from the next period. */
export const changeInterval = asyncHandler(async (req: Request, res: Response) => {
  const owner = myOwner(req);
  if (!("supplier" in owner)) throw new ApiError(403, "Hotels pay per year");
  const sub = await Subscription.findOne({ ...owner, status: "active", plan: "supplier-contract" });
  if (!sub) throw new ApiError(404, "You have no active membership");
  sub.interval = req.body.interval;
  await sub.save();
  return ApiResponse(res, 200, "Saved — this applies from your next period", sub);
});

// ── Admins ──

export const adminListInvoices = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.kind) filter.kind = req.query.kind;
  if (req.query.hotel) filter.hotel = req.query.hotel;
  if (req.query.supplier) filter.supplier = req.query.supplier;
  const [items, totals] = await Promise.all([
    Invoice.find(filter).populate("hotel", "name memberNumber").populate("supplier", "name memberNumber").sort({ issuedAt: -1 }).limit(300).lean(),
    Invoice.aggregate<{ _id: string; total: number; count: number }>([{ $group: { _id: "$status", total: { $sum: "$total" }, count: { $sum: 1 } } }]),
  ]);
  return ApiResponse(res, 200, "Invoices fetched", { items, totals });
});

/** For bank transfers or payments outside Mollie/Moneybird: marking paid also starts the ad or promotion. */
export const adminMarkPaid = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.status === "cancelled") throw new ApiError(409, "This invoice was cancelled");
  return ApiResponse(res, 200, "Marked as paid", await markInvoicePaid(invoice, "admin"));
});

export const adminCancelInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.status === "paid") throw new ApiError(409, "A paid invoice cannot be cancelled");
  return ApiResponse(res, 200, "Invoice cancelled", await cancelInvoice(invoice));
});

/** GET /billing/admin/member?hotel=…|supplier=… — membership and invoices of one member. */
export const adminMemberBilling = asyncHandler(async (req: Request, res: Response) => {
  const owner = req.query.hotel ? { hotel: String(req.query.hotel) } : req.query.supplier ? { supplier: String(req.query.supplier) } : null;
  if (!owner) throw new ApiError(422, "Give a hotel or supplier");
  const [subscription, invoices] = await Promise.all([
    Subscription.findOne(owner).sort({ createdAt: -1 }).lean(),
    Invoice.find(owner).sort({ issuedAt: -1 }).limit(50).lean(),
  ]);
  return ApiResponse(res, 200, "Billing fetched", { subscription, invoices });
});

/** Starts billing for a member set up by hand (the first ten hotels and suppliers are free during the test phase). */
export const adminStartSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { hotel, supplier, interval } = req.body as { hotel?: string; supplier?: string; interval?: "month" | "year" };
  if (hotel) return ApiResponse(res, 201, "Membership started", await startSubscription({ hotel }, "hotel", "year"));
  if (!supplier) throw new ApiError(422, "Give a hotel or supplier");
  const s = await Supplier.findById(supplier).select("plan").lean();
  if (!s) throw new ApiError(404, "Supplier not found");
  if (s.plan !== "contract") throw new ApiError(409, "This supplier has no maintenance contract: it pays commission per won job");
  return ApiResponse(res, 201, "Membership started", await startSubscription({ supplier }, "supplier-contract", interval ?? "month"));
});

export const adminCancelSubscription = asyncHandler(async (req: Request, res: Response) => {
  const sub = await Subscription.findById(req.params.id);
  if (!sub) throw new ApiError(404, "Membership not found");
  return ApiResponse(res, 200, "Membership stops at the end of the paid period", await cancelSubscription(sub));
});

// ── Mollie ──

/**
 * POST /payments/mollie/webhook — Mollie posts only the payment id; we fetch
 * the payment ourselves, so a fake call cannot mark anything as paid.
 */
export const mollieWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.body?.id ?? "");
  if (!id || !mollieEnabled()) return res.status(200).end();
  const payment = await getMolliePayment(id);
  const invoice = await Invoice.findOne({ molliePaymentId: payment.id });
  if (invoice && payment.status === "paid") await markInvoicePaid(invoice, "mollie");
  return res.status(200).end();
});
