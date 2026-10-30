import type { Request, Response } from "express";
import { PortalLink } from "../models/portalLink.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, queryString } from "../utils/listQuery";
import { pick } from "../utils/pick";

// Handige links & portalen of the signed-in hotel (briefing §3.11).

const EDITABLE = ["category", "customCategory", "name", "url", "username", "notes"] as const;
const mine = (req: Request) => ({ hotel: req.user!.hotel });

/** Only "Other" keeps its own category name. */
function cleanBody(body: Record<string, unknown>) {
  const data = pick(body, EDITABLE);
  if (data.category && data.category !== "Other") data.customCategory = "";
  return data;
}

/** All links, sorted by category, then name. */
export const listPortalLinks = asyncHandler(async (req: Request, res: Response) => {
  const q = queryString(req, "q");
  const filter: Record<string, unknown> = mine(req);
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ name: match }, { customCategory: match }, { username: match }, { notes: match }];
  }
  const links = await PortalLink.find(filter).sort({ category: 1, name: 1 }).lean();
  return ApiResponse(res, 200, "Links fetched successfully", links);
});

export const getPortalLink = asyncHandler(async (req: Request, res: Response) => {
  const link = await PortalLink.findOne({ _id: req.params.id, ...mine(req) }).lean();
  if (!link) throw new ApiError(404, "Link not found");
  return ApiResponse(res, 200, "Link fetched successfully", link);
});

export const createPortalLink = asyncHandler(async (req: Request, res: Response) => {
  const link = await PortalLink.create({ ...cleanBody(req.body), ...mine(req) });
  return ApiResponse(res, 201, "Link added successfully", link);
});

export const updatePortalLink = asyncHandler(async (req: Request, res: Response) => {
  const link = await PortalLink.findOne({ _id: req.params.id, ...mine(req) });
  if (!link) throw new ApiError(404, "Link not found");
  link.set(cleanBody(req.body));
  await link.save();
  return ApiResponse(res, 200, "Link saved successfully", link);
});

export const deletePortalLink = asyncHandler(async (req: Request, res: Response) => {
  const link = await PortalLink.findOneAndDelete({ _id: req.params.id, ...mine(req) });
  if (!link) throw new ApiError(404, "Link not found");
  return ApiResponse(res, 200, "Link deleted successfully");
});
