import type { Request, Response } from "express";
import { FOUNDING_FREE_MONTHS, HOTEL_TIERS, hotelTier, NOTICE_MONTHS, SUPPLIER_FREE_UNTIL, SUPPLIER_PRICES, supplierPlan, VAT_RATE } from "../config/billing";
import { Hotel } from "../models/hotel.model";
import { Invoice } from "../models/invoice.model";
import { Subscription } from "../models/subscription.model";
import { Supplier } from "../models/supplier.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { cancelInvoice, cancelSubscription, changePaymentMethod, markInvoicePaid, setFoundingMember, startSubscription, yearlyPrice, type Owner } from "../services/billing";
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
  const [subscription, invoices, member] = await Promise.all([
    Subscription.findOne({ ...owner }).sort({ createdAt: -1 }).lean(),
    Invoice.find({ ...owner }).select(PUBLIC_INVOICE).sort({ issuedAt: -1 }).limit(100).lean(),
    "supplier" in owner
      ? Supplier.findById(owner.supplier).select("plan foundingMember blocked").lean()
      : Hotel.findById(owner.hotel).select("foundingMember facilities.rooms").lean(),
  ]);
  const rooms = member && "facilities" in member ? member.facilities?.rooms ?? null : null;
  const active = subscription ? await Subscription.findById(subscription._id) : null;
  return ApiResponse(res, 200, "Billing fetched", {
    subscription,
    invoices,
    plan: member && "plan" in member ? member.plan : null,
    foundingMember: Boolean(member?.foundingMember),
    rooms,
    // The yearly price of the next paid period (excl. VAT).
    nextYearPrice: active ? await yearlyPrice(active) : "supplier" in owner ? SUPPLIER_PRICES[supplierPlan((member as { plan?: string })?.plan)].year : hotelTier(rooms).price,
    prices: {
      hotelTiers: HOTEL_TIERS.map((t) => ({ key: t.key, maxRooms: Number.isFinite(t.maxRooms) ? t.maxRooms : null, price: t.price })),
      foundingFreeMonths: FOUNDING_FREE_MONTHS,
      suppliers: SUPPLIER_PRICES,
      supplierFreeUntil: SUPPLIER_FREE_UNTIL,
      noticeMonths: NOTICE_MONTHS,
      vatRate: VAT_RATE,
    },
    online: { mollie: mollieEnabled(), moneybird: moneybirdEnabled() },
  });
});

/**
 * POST /billing/mine/cancel — agreements §6: suppliers in the free period leave
 * straight away; otherwise the membership ends at the end of the contract year
 * (or a year later when less than 3 months' notice). No refunds.
 */
export const cancelMyMembership = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role === "hotel_manager" || req.user!.role === "supplier") {
    const sub = await Subscription.findOne({ ...myOwner(req), status: "active" });
    if (!sub) throw new ApiError(404, "You have no active membership");
    await cancelSubscription(sub);
    return ApiResponse(res, 200, "Your membership is cancelled", sub);
  }
  throw new ApiError(403, "Only the hotel manager or the supplier can cancel");
});

/** PATCH /billing/mine/payment-method — SEPA direct debit (default) or paying each invoice by hand. */
export const changeMyPaymentMethod = asyncHandler(async (req: Request, res: Response) => {
  const owner = myOwner(req);
  const sub = await Subscription.findOne({ ...owner, status: "active" });
  if (!sub) throw new ApiError(404, "You have no active membership");
  await changePaymentMethod(sub, req.body.paymentMethod);
  return ApiResponse(res, 200, req.body.paymentMethod === "sepa" ? "Saved — the next invoice is collected by direct debit" : "Saved — you pay the next invoice yourself", sub);
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
  const member = "hotel" in owner
    ? await Hotel.findById(owner.hotel).select("foundingMember").lean()
    : await Supplier.findById(owner.supplier).select("foundingMember blocked").lean();
  return ApiResponse(res, 200, "Billing fetched", {
    subscription,
    invoices,
    foundingMember: Boolean(member?.foundingMember),
    blocked: Boolean(member && "blocked" in member && member.blocked),
  });
});

/** Starts the membership of a member set up by hand (the first ten hotels and suppliers). */
export const adminStartSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { hotel, supplier } = req.body as { hotel?: string; supplier?: string };
  if (hotel) return ApiResponse(res, 201, "Membership started", await startSubscription({ hotel }, "hotel"));
  if (!supplier) throw new ApiError(422, "Give a hotel or supplier");
  const s = await Supplier.findById(supplier).select("plan").lean();
  if (!s) throw new ApiError(404, "Supplier not found");
  return ApiResponse(res, 201, "Membership started", await startSubscription({ supplier }, supplierPlan(s.plan)));
});

/** POST /billing/admin/founding — { hotel | supplier, founding }: the introductory price, from the next period. */
export const adminSetFounding = asyncHandler(async (req: Request, res: Response) => {
  const { hotel, supplier, founding } = req.body as { hotel?: string; supplier?: string; founding: boolean };
  const owner: Owner | null = hotel ? { hotel } : supplier ? { supplier } : null;
  if (!owner) throw new ApiError(422, "Give a hotel or supplier");
  await setFoundingMember(owner, Boolean(founding));
  return ApiResponse(res, 200, founding ? "Founding member — the introductory price applies from the next period" : "Standard price from the next period", { founding: Boolean(founding) });
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
