import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Voucher } from "../models/voucher.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";

// The signed-in hotel's own corporate vouchers (briefing §3.10). They are on
// the public voucher page straight away; promoting a voucher (paid) comes later.

const EDITABLE = ["title", "teaser", "description", "discountPercent", "category", "bookingUrl", "isActive"] as const;
const IMAGE = { field: "image", keyField: "imageKey", folder: "vouchers" } as const;
const mine = (req: Request) => ({ hotel: req.user!.hotel });

async function findMine(req: Request) {
  const voucher = await Voucher.findOne({ _id: req.params.id, ...mine(req) });
  if (!voucher) throw new ApiError(404, "Voucher not found");
  return voucher;
}

export const listMyVouchers = asyncHandler(async (req: Request, res: Response) => {
  const vouchers = await Voucher.find(mine(req)).sort({ createdAt: -1 }).lean();
  return ApiResponse(res, 200, "Vouchers fetched successfully", vouchers);
});

export const getMyVoucher = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Voucher fetched successfully", await findMine(req));
});

export const createMyVoucher = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.user!.hotel).select("region").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  const voucher = await Voucher.create({ ...pick(req.body, EDITABLE), hotel: hotel._id, region: hotel.region });
  return ApiResponse(res, 201, "Voucher published", voucher);
});

export const updateMyVoucher = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await findMine(req);
  voucher.set(pick(req.body, EDITABLE));
  await voucher.save();
  return ApiResponse(res, 200, "Voucher saved", voucher);
});

export const deleteMyVoucher = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await findMine(req);
  await removeImage(voucher, IMAGE).catch(() => undefined);
  await voucher.deleteOne();
  return ApiResponse(res, 200, "Voucher deleted");
});

/** PUT /my-vouchers/:id/image (field "image") */
export const uploadMyVoucherImage = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await findMine(req);
  await replaceImage(voucher, req.file, IMAGE);
  return ApiResponse(res, 200, "Photo updated", voucher);
});

export const deleteMyVoucherImage = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await findMine(req);
  await removeImage(voucher, IMAGE);
  return ApiResponse(res, 200, "Photo removed", voucher);
});
