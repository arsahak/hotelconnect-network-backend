import type { Request, Response } from "express";
import { AdBooking } from "../models/adBooking.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { adAvailability, cancelAdBooking, createAdBooking, liveSponsored } from "../services/ads";
import type { Owner } from "../services/billing";
import { getFeatures } from "../models/setting.model";

// Sponsored homepage spots (briefing §2.1, §3.15, §4.9).

function myOwner(req: Request): Owner {
  if (req.user!.role === "hotel_manager" && req.user!.hotel) return { hotel: req.user!.hotel };
  if (req.user!.role === "supplier" && req.user!.supplier) return { supplier: req.user!.supplier };
  throw new ApiError(403, "This account cannot book ads");
}

/** GET /ads/sponsored — public: what the homepage shows as "Sponsored". */
export const sponsored = asyncHandler(async (_req: Request, res: Response) =>
  // Phase 2 (v4): with advertising off the homepage shows no sponsored items.
  ApiResponse(res, 200, "Sponsored", (await getFeatures()).advertising ? await liveSponsored() : { suppliers: [], hotels: [], jobs: [] })
);

export const availability = asyncHandler(async (_req: Request, res: Response) => ApiResponse(res, 200, "Availability", await adAvailability()));

export const myBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await AdBooking.find(myOwner(req)).populate("invoice", "number total status paymentUrl").populate("vacancy", "title").sort({ createdAt: -1 }).lean();
  return ApiResponse(res, 200, "Bookings", bookings);
});

export const book = asyncHandler(async (req: Request, res: Response) => {
  const { booking, invoice } = await createAdBooking({ owner: myOwner(req), block: req.body.block, position: Number(req.body.position), period: req.body.period, vacancyId: req.body.vacancy });
  return ApiResponse(res, 201, invoice.paymentUrl ? "Booked — pay to place it in line" : "Booked — HotelConnect sends you the invoice", {
    booking,
    invoice: { _id: invoice._id, number: invoice.number, total: invoice.total, paymentUrl: invoice.paymentUrl },
  });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => ApiResponse(res, 200, "Booking cancelled", await cancelAdBooking(myOwner(req), String(req.params.id))));

export const adminBookings = asyncHandler(async (_req: Request, res: Response) => {
  const bookings = await AdBooking.find({ status: { $ne: "cancelled" } })
    .populate("hotel", "name memberNumber")
    .populate("supplier", "name memberNumber")
    .populate("vacancy", "title")
    .populate("invoice", "number status total")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  return ApiResponse(res, 200, "Bookings", bookings);
});
