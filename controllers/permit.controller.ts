import type { Request, Response } from "express";
import { Permit } from "../models/permit.model";
import { Hotel } from "../models/hotel.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { complianceSuggestions } from "../utils/complianceProfile";
import { containsRegex, queryString } from "../utils/listQuery";
import { pick } from "../utils/pick";

// Permits and certificates of the signed-in hotel (briefing §3.4.4).

const EDITABLE = ["type", "authority", "issueDate", "expiryDate", "documentLink", "notes"] as const;
const mine = (req: Request) => ({ hotel: req.user!.hotel });

/** All permits, soonest expiry first, plus suggestions from the hotel's compliance profile. */
export const listPermits = asyncHandler(async (req: Request, res: Response) => {
  const q = queryString(req, "q");
  const filter: Record<string, unknown> = mine(req);
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ type: match }, { authority: match }];
  }
  const [permits, hotel] = await Promise.all([
    Permit.find(filter).sort({ expiryDate: 1, createdAt: -1 }).lean(),
    Hotel.findById(req.user!.hotel).select("facilities").lean(),
  ]);
  return ApiResponse(res, 200, "Permits fetched successfully", {
    items: permits,
    suggestions: hotel ? complianceSuggestions(hotel.facilities).permits : [],
  });
});

export const getPermit = asyncHandler(async (req: Request, res: Response) => {
  const permit = await Permit.findOne({ _id: req.params.id, ...mine(req) }).lean();
  if (!permit) throw new ApiError(404, "Permit not found");
  return ApiResponse(res, 200, "Permit fetched successfully", permit);
});

export const createPermit = asyncHandler(async (req: Request, res: Response) => {
  const permit = await Permit.create({ ...pick(req.body, EDITABLE), ...mine(req) });
  return ApiResponse(res, 201, "Permit added successfully", permit);
});

export const updatePermit = asyncHandler(async (req: Request, res: Response) => {
  const permit = await Permit.findOne({ _id: req.params.id, ...mine(req) });
  if (!permit) throw new ApiError(404, "Permit not found");
  permit.set(pick(req.body, EDITABLE));
  await permit.save();
  return ApiResponse(res, 200, "Permit saved successfully", permit);
});

export const deletePermit = asyncHandler(async (req: Request, res: Response) => {
  const permit = await Permit.findOneAndDelete({ _id: req.params.id, ...mine(req) });
  if (!permit) throw new ApiError(404, "Permit not found");
  return ApiResponse(res, 200, "Permit deleted successfully");
});
