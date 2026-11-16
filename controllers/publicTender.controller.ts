import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Tender } from "../models/tender.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

// Public Tenders page (Master Briefing v4): open tenders, anonymous. A
// signed-in supplier also sees the hotel and the contact email (free until
// 1 May 2028), so it can send its quote straight to the hotel.

/** Open and still taking quotes (the deadline day counts). */
const openNow = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return { status: "open", deadline: { $gte: today } };
};

const PUBLIC_FIELDS = "type title category country region description deadline size createdAt";

type Revealed = { hotel: { name: string; city: string; emails?: { general?: string } } | null; contactEmail?: string };

function present(tender: Record<string, unknown> & Revealed, signedIn: boolean) {
  const { hotel, contactEmail, ...rest } = tender;
  if (!signedIn) return { ...rest, hotel: null, contactEmail: null };
  return { ...rest, hotel: hotel && { name: hotel.name, city: hotel.city }, contactEmail: contactEmail || hotel?.emails?.general || "" };
}

/** GET /public-tenders — newest first; ?q, ?category, ?country, ?page, ?limit. */
export const listPublicTenders = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 12);
  const filter: Record<string, unknown> = { ...openNow() };
  if (req.query.category) filter.category = String(req.query.category);
  if (req.query.country) filter.country = String(req.query.country);
  if (req.query.q) {
    const match = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: match }, { description: match }, { category: match }];
  }
  const signedIn = Boolean(req.supplier);
  const select = signedIn ? `${PUBLIC_FIELDS} hotel contactEmail` : PUBLIC_FIELDS;
  const [items, total] = await Promise.all([
    Tender.find(filter)
      .select(select)
      .populate(signedIn ? { path: "hotel", select: "name city emails.general" } : [])
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Tender.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Tenders fetched successfully", {
    items: items.map((t) => present(t as never, signedIn)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    signedIn,
  });
});

/** GET /public-tenders/count — the menu shows "Tenders" only when this is above 0. */
export const countPublicTenders = asyncHandler(async (_req: Request, res: Response) => {
  return ApiResponse(res, 200, "Open tenders counted", { open: await Tender.countDocuments(openNow()) });
});

/** GET /public-tenders/:id */
export const getPublicTender = asyncHandler(async (req: Request, res: Response) => {
  const signedIn = Boolean(req.supplier);
  const tender = await Tender.findOne({ _id: req.params.id, ...openNow() })
    .select(signedIn ? `${PUBLIC_FIELDS} hotel contactEmail` : PUBLIC_FIELDS)
    .populate(signedIn ? { path: "hotel", select: "name city emails.general" } : [])
    .lean();
  if (!tender) throw new ApiError(404, "This tender is closed or does not exist");
  return ApiResponse(res, 200, "Tender fetched successfully", { ...present(tender as never, signedIn), signedIn });
});
