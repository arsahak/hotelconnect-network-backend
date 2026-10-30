import type { Request, Response } from "express";
import { Hotel } from "../models/hotel.model";
import { Supplier } from "../models/supplier.model";
import { Voucher, VOUCHER_MEMBER_FIELDS, VOUCHER_TEASER_FIELDS } from "../models/voucher.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, pagination, queryString, toPage } from "../utils/listQuery";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";
import { deleteFromSpaces } from "../utils/uploadToSpaces";

const SLIDESHOW_SIZE = 10;

async function activeVoucherFilter() {
  const activeHotels = await Hotel.find({ isActive: true }).distinct("_id");
  return { isActive: true, hotel: { $in: activeHotels } };
}

/**
 * Public slideshow on the suppliers page (briefing §2.4): up to 10 vouchers,
 * paid promotions first, then the newest. No booking links here.
 */
export const listFeaturedVouchers = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const filter = await activeVoucherFilter();

  const [promoted, latest] = await Promise.all([
    Voucher.find({ ...filter, promotedUntil: { $gt: now } })
      .select(VOUCHER_TEASER_FIELDS)
      .populate("hotel", "name city")
      .sort({ createdAt: -1 })
      .limit(SLIDESHOW_SIZE)
      .lean(),
    Voucher.find({ ...filter, $or: [{ promotedUntil: null }, { promotedUntil: { $lte: now } }] })
      .select(VOUCHER_TEASER_FIELDS)
      .populate("hotel", "name city")
      .sort({ createdAt: -1 })
      .limit(SLIDESHOW_SIZE)
      .lean(),
  ]);

  const items = [...promoted, ...latest]
    .slice(0, SLIDESHOW_SIZE)
    .map(({ promotedUntil, ...voucher }) => ({
      ...voucher,
      promoted: Boolean(promotedUntil && promotedUntil > now),
    }));

  return ApiResponse(res, 200, "Vouchers fetched successfully", items);
});

/**
 * All vouchers with booking links — for suppliers only (briefing §2.5). The
 * supplier enters their member number (L001…); it must exist and be active.
 */
export const memberVouchers = asyncHandler(async (req: Request, res: Response) => {
  const memberNumber = String(req.body.memberNumber).toUpperCase();
  const supplier = await Supplier.findOne({ memberNumber, isActive: true }).select("memberNumber name").lean();
  if (!supplier) {
    throw new ApiError(403, "This member number is not known or not active");
  }
  return sendMemberVouchers(res, supplier);
});

/** GET /vouchers/member — the same list for a supplier signed in on the website (supplierOnly). */
export const signedInMemberVouchers = asyncHandler(async (req: Request, res: Response) => {
  return sendMemberVouchers(res, req.supplier!);
});

async function sendMemberVouchers(res: Response, supplier: { memberNumber: string; name: string }) {
  const vouchers = await Voucher.find(await activeVoucherFilter())
    .select(VOUCHER_MEMBER_FIELDS)
    .populate("hotel", "name city slug")
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse(res, 200, "Vouchers fetched successfully", {
    member: { memberNumber: supplier.memberNumber, name: supplier.name },
    vouchers,
  });
}

/**
 * GET /vouchers/:id/booking — the hotel's booking link of one voucher, for a
 * supplier signed in on the website (briefing §2.4 "Boek nu"; supplierOnly).
 */
export const voucherBooking = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findOne({ _id: req.params.id, ...(await activeVoucherFilter()) })
    .select("bookingUrl")
    .lean();
  if (!voucher) throw new ApiError(404, "Voucher not found");
  return ApiResponse(res, 200, "Booking link fetched", { bookingUrl: voucher.bookingUrl });
});

// ── Admin: manage vouchers (admin / superadmin) ─────────────────────────────

const VOUCHER_EDITABLE = ["title", "teaser", "description", "discountPercent", "category", "bookingUrl", "isActive"] as const;

const toDateOrNull = (value: unknown) => (value ? new Date(String(value)) : null);

export const adminListVouchers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 20);
  const q = queryString(req, "q");
  const category = queryString(req, "category");
  const hotel = queryString(req, "hotel");

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;
  if (hotel) filter.hotel = hotel;
  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;
  if (q) filter.title = containsRegex(q);

  const [items, total] = await Promise.all([
    Voucher.find(filter).populate("hotel", "name city memberNumber").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Voucher.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Vouchers fetched successfully", toPage(items, total, page, limit));
});

export const adminGetVoucher = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findById(req.params.id).populate("hotel", "name city memberNumber").lean();
  if (!voucher) throw new ApiError(404, "Voucher not found");
  return ApiResponse(res, 200, "Voucher fetched successfully", voucher);
});

export const createVoucher = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.body.hotel).select("region").lean();
  if (!hotel) throw new ApiError(422, "This hotel does not exist");

  const voucher = await Voucher.create({
    ...pick(req.body, VOUCHER_EDITABLE),
    hotel: hotel._id,
    region: hotel.region,
    promotedUntil: toDateOrNull(req.body.promotedUntil),
  });
  return ApiResponse(res, 201, "Voucher created successfully", voucher);
});

export const updateVoucher = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw new ApiError(404, "Voucher not found");

  if (req.body.hotel && String(req.body.hotel) !== String(voucher.hotel)) {
    const hotel = await Hotel.findById(req.body.hotel).select("region").lean();
    if (!hotel) throw new ApiError(422, "This hotel does not exist");
    voucher.set({ hotel: hotel._id, region: hotel.region });
  }
  voucher.set(pick(req.body, VOUCHER_EDITABLE));
  if (req.body.promotedUntil !== undefined) voucher.promotedUntil = toDateOrNull(req.body.promotedUntil);

  await voucher.save();
  return ApiResponse(res, 200, "Voucher updated successfully", voucher);
});

export const deleteVoucher = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findByIdAndDelete(req.params.id);
  if (!voucher) throw new ApiError(404, "Voucher not found");
  await deleteFromSpaces(voucher.imageKey);
  return ApiResponse(res, 200, "Voucher deleted successfully");
});

const VOUCHER_IMAGE = { field: "image", keyField: "imageKey", folder: "vouchers" };

export const uploadVoucherImage = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw new ApiError(404, "Voucher not found");
  await replaceImage(voucher, req.file, VOUCHER_IMAGE);
  return ApiResponse(res, 200, "Photo updated successfully", voucher);
});

export const deleteVoucherImage = asyncHandler(async (req: Request, res: Response) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw new ApiError(404, "Voucher not found");
  await removeImage(voucher, VOUCHER_IMAGE);
  return ApiResponse(res, 200, "Photo removed successfully", voucher);
});
