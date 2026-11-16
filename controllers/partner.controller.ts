import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { Contract } from "../models/contract.model";
import { Hotel } from "../models/hotel.model";
import { Partner } from "../models/partner.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { inviteSupplier } from "../utils/partners";

// Trusted suppliers of a hotel (Master Briefing v4: 1-click invite, My Partner Hotels).

/** GET /my-hotel/partners — invited and active partners of the signed-in hotel. */
export const listMyPartners = asyncHandler(async (req: Request, res: Response) => {
  const partners = await Partner.find({ hotel: req.user!.hotel })
    .populate("supplier", "name slug logo memberNumber")
    .sort({ status: 1, company: 1 })
    .lean();
  return ApiResponse(res, 200, "Partners fetched successfully", partners);
});

/**
 * POST /my-hotel/partners/invite — { contract } (takes company + email from
 * the contract) or { email, company }.
 */
export const invitePartner = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.user!.hotel).select("name city country").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");

  let { email, company } = req.body as { email?: string; company?: string };
  let contractId: string | null = null;
  if (req.body.contract) {
    const contract = await Contract.findOne({ _id: req.body.contract, hotel: hotel._id }).select("company email").lean();
    if (!contract) throw new ApiError(404, "Contract not found");
    if (!contract.email) throw new ApiError(422, "Add the supplier's email to this contract first");
    email = contract.email;
    company = contract.company ?? "";
    contractId = String(contract._id);
  }
  if (!email) throw new ApiError(422, "Fill in the supplier's email address");

  const result = await inviteSupplier(hotel, { email, company: company ?? "", contract: contractId });
  const message = result.already
    ? "This supplier is already your partner"
    : result.tooSoon
      ? "Already invited today — the supplier can use the link from that email"
      : result.linked
        ? "This supplier is already on HotelConnect and is now your partner"
        : "Invite sent";
  const { token: _token, ...partner } = result.partner.toObject();
  return ApiResponse(res, result.sent ? 201 : 200, message, partner);
});

/** GET /my-supplier/partners — My Partner Hotels: hotels that invited this supplier. */
export const listMyPartnerHotels = asyncHandler(async (req: Request, res: Response) => {
  const partners = await Partner.find({ supplier: req.supplier!._id, status: "active" })
    .populate("hotel", "name slug city image")
    .sort({ acceptedAt: -1 })
    .lean();
  return ApiResponse(
    res,
    200,
    "Partner hotels fetched successfully",
    partners.filter((p) => p.hotel).map((p) => ({ _id: p._id, hotel: p.hotel, since: p.acceptedAt ?? p.createdAt }))
  );
});
