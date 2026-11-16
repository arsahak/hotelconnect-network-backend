import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { hasFirstContract } from "../utils/hotelProgress";
import { asyncHandler } from "./asyncHandler";

/**
 * Master Briefing v4 progress bar, 75%: a hotel unlocks Tenders and Jobs by
 * adding its first contract. Suppliers and admins pass straight through.
 */
export const requireFirstContract = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const hotel = req.user?.hotel;
  if (hotel && !(await hasFirstContract(hotel))) {
    throw new ApiError(403, "Add your first contract to unlock Tenders and Jobs (onboarding 75%).");
  }
  next();
});
