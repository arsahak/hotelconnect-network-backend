import type { NextFunction, Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { ApiError } from "../utils/ApiError";
import { hotelProgress } from "../utils/hotelProgress";
import { asyncHandler } from "./asyncHandler";

/**
 * Terms & Conditions for hotels, Art. 2.3 (client, 21 Nov 2026): a hotel can
 * use Tenders and Jobs only once its onboarding is 100% complete (company
 * details, rooms + staff, a contract, main photo + booking link). Suppliers
 * and admins pass straight through.
 */
export const requireFullOnboarding = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const hotelId = req.user?.hotel;
  if (!hotelId) return next();
  const hotel = await Hotel.findById(hotelId).select("name address city emails facilities image bookingUrl").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  const progress = await hotelProgress(hotel);
  if (progress.percent < 100) {
    throw new ApiError(403, `Complete your onboarding (now ${progress.percent}%) to use Tenders and Jobs.`);
  }
  next();
});
