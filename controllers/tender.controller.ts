import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Offer } from "../models/offer.model";
import { Review } from "../models/review.model";
import { Tender } from "../models/tender.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, queryString } from "../utils/listQuery";
import { pick } from "../utils/pick";
import { recalculateSupplierRating } from "../utils/supplierRating";
import { notifyInvitations, notifyResult, pickSuppliers } from "../utils/tenders";
import { chargeCommission } from "../services/billing";

// Tenders of the signed-in hotel (briefing §3.5): send, compare quotes, pick a winner.

const mine = (req: Request) => ({ hotel: req.user!.hotel });
const SUPPLIER_FIELDS = "name slug logo memberNumber";

/** All tenders, newest first, with how many quotes came in. */
export const listTenders = asyncHandler(async (req: Request, res: Response) => {
  const q = queryString(req, "q");
  const filter: Record<string, unknown> = mine(req);
  if (q) filter.$or = [{ title: containsRegex(q) }, { description: containsRegex(q) }];

  const tenders = await Tender.find(filter).sort({ createdAt: -1 }).lean();
  const counts = await Offer.aggregate<{ _id: unknown; count: number }>([
    { $match: { tender: { $in: tenders.map((t) => t._id) } } },
    { $group: { _id: "$tender", count: { $sum: 1 } } },
  ]);
  const byTender = new Map(counts.map((c) => [String(c._id), c.count]));

  return ApiResponse(
    res,
    200,
    "Tenders fetched successfully",
    tenders.map((t) => ({ ...t, invitedCount: t.invitedSuppliers.length, offerCount: byTender.get(String(t._id)) ?? 0 }))
  );
});

/** One tender with the invited suppliers and their quotes (cheapest first). */
export const getTender = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...mine(req) })
    .populate("invitedSuppliers", SUPPLIER_FIELDS)
    .lean();
  if (!tender) throw new ApiError(404, "Tender not found");
  const [offers, review] = await Promise.all([
    Offer.find({ tender: tender._id }).select("-file.key").populate("supplier", SUPPLIER_FIELDS).sort({ price: 1 }).lean(),
    Review.findOne({ tender: tender._id }).lean(),
  ]);
  return ApiResponse(res, 200, "Tender fetched successfully", { ...tender, offers, review });
});

/** Sends a new tender to at most three matching suppliers and emails them. */
export const createTender = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.user!.hotel).select("name city emails").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const data = pick(req.body, ["type", "title", "category", "region", "description", "deadline", "budget"] as const);
  const suppliers = await pickSuppliers(String(data.category), String(data.region));
  const tender = await Tender.create({ ...data, ...mine(req), invitedSuppliers: suppliers.map((s) => s._id) });

  await notifyInvitations(tender, hotel, suppliers);
  return ApiResponse(
    res,
    201,
    suppliers.length ? `Tender sent to ${suppliers.length} supplier(s)` : "Tender saved; no matching supplier yet",
    { ...tender.toJSON(), invitedCount: suppliers.length }
  );
});

/** While open: change the title, description, deadline or budget. */
export const updateTender = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...mine(req) });
  if (!tender) throw new ApiError(404, "Tender not found");
  if (tender.status !== "open") throw new ApiError(409, "Only an open tender can be changed");
  tender.set(pick(req.body, ["title", "description", "deadline", "budget"] as const));
  await tender.save();
  return ApiResponse(res, 200, "Tender saved successfully", tender);
});

/** Picks the winning quote; the other quotes lose. Every supplier with a quote is emailed. */
export const awardTender = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...mine(req) });
  if (!tender) throw new ApiError(404, "Tender not found");
  if (tender.status !== "open") throw new ApiError(409, "This tender is already closed");

  const winner = await Offer.findOne({ _id: req.body.offerId, tender: tender._id });
  if (!winner) throw new ApiError(404, "Quote not found");

  await Promise.all([
    Offer.updateOne({ _id: winner._id }, { status: "won" }),
    Offer.updateMany({ tender: tender._id, _id: { $ne: winner._id } }, { status: "lost" }),
  ]);
  tender.set({ status: "awarded", winner: winner._id, awardedAt: new Date() });
  await tender.save();
  // Price page: a supplier without a contract pays commission on the won job.
  await chargeCommission({ supplierId: winner.supplier, tenderId: String(tender._id), tenderTitle: tender.title, offerPriceCents: Math.round(winner.price * 100) });

  const [hotel, offers] = await Promise.all([
    Hotel.findById(tender.hotel).select("name").lean(),
    Offer.find({ tender: tender._id }).populate<{ supplier: { _id: unknown; name: string; contact?: { email?: string }; emails?: { notifications?: string } } }>("supplier", "name contact emails").lean(),
  ]);
  await Promise.all(
    offers.map((offer) => notifyResult(tender, hotel!, offer.supplier, String(offer._id) === String(winner._id)))
  );
  return ApiResponse(res, 200, "Winner chosen", tender);
});

/** Stops an open tender; suppliers can no longer send quotes. */
export const cancelTender = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...mine(req) });
  if (!tender) throw new ApiError(404, "Tender not found");
  if (tender.status !== "open") throw new ApiError(409, "This tender is already closed");
  tender.status = "cancelled";
  await tender.save();
  return ApiResponse(res, 200, "Tender cancelled", tender);
});

/**
 * PUT /tenders/:id/review — Kwaliteitsformulier (briefing §3.8): the hotel
 * rates the chosen supplier once the job is done; it can change the review
 * later. The supplier's ranking is recalculated straight away.
 */
export const reviewTender = asyncHandler(async (req: Request, res: Response) => {
  const tender = await Tender.findOne({ _id: req.params.id, ...mine(req) });
  if (!tender) throw new ApiError(404, "Tender not found");
  if (tender.status !== "awarded" || !tender.winner) throw new ApiError(409, "Choose a winner before rating the supplier");
  const winner = await Offer.findById(tender.winner).select("supplier").lean();
  if (!winner) throw new ApiError(404, "The winning quote no longer exists");

  const data = pick(req.body, ["rating", "onTime", "communication", "wouldHireAgain", "comments"] as const);
  const review = await Review.findOneAndUpdate(
    { tender: tender._id },
    { ...data, tender: tender._id, hotel: tender.hotel, supplier: winner.supplier },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await recalculateSupplierRating(winner.supplier);
  return ApiResponse(res, 200, "Thank you for your review", review);
});
