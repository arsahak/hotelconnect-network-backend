import type { Request, Response } from "express";
import { Hotel, HOTEL_PUBLIC_FIELDS } from "../models/hotel.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, pagination, queryString, toPage } from "../utils/listQuery";
import { Vacancy } from "../models/vacancy.model";
import { Voucher } from "../models/voucher.model";
import { Contract } from "../models/contract.model";
import { FaultContact } from "../models/faultContact.model";
import { Permit } from "../models/permit.model";
import { PortalLink } from "../models/portalLink.model";
import { Offer } from "../models/offer.model";
import { Notification } from "../models/notification.model";
import { Review } from "../models/review.model";
import { recalculateSupplierRating } from "../utils/supplierRating";
import { deleteHotelParticipations } from "./purchase.controller";
import { Tender } from "../models/tender.model";
import { HOTEL_ROLES, User } from "../models/user.model";
import { nextMemberNumber } from "../utils/memberNumber";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";
import { uniqueSlug } from "../utils/slugify";
import { deleteFromSpaces } from "../utils/uploadToSpaces";

// ── Public: hotel guide (briefing §2.3) ─────────────────────────────────────

export const listHotels = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 12);
  const q = queryString(req, "q");
  const region = queryString(req, "region");

  const filter: Record<string, unknown> = { isActive: true };
  if (region) filter.region = region;
  if (req.query.featured === "true") filter.featured = true;
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ name: match }, { city: match }, { description: match }, { address: match }];
  }

  const [items, total] = await Promise.all([
    Hotel.find(filter)
      .select(HOTEL_PUBLIC_FIELDS)
      .sort({ featured: -1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Hotel.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Hotels fetched successfully", toPage(items, total, page, limit));
});

export const getHotel = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findOne({ slug: req.params.slug, isActive: true })
    .select(HOTEL_PUBLIC_FIELDS)
    .lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return ApiResponse(res, 200, "Hotel fetched successfully", hotel);
});

// ── Admin: manage hotels (admin / superadmin) ───────────────────────────────

const HOTEL_EDITABLE = [
  "name",
  "city",
  "region",
  "address",
  "description",
  "bookingUrl",
  "offer",
  "featured",
  "isActive",
] as const;

/** Every hotel, active or not, with private fields. */
export const adminListHotels = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 20);
  const q = queryString(req, "q");
  const region = queryString(req, "region");

  const filter: Record<string, unknown> = {};
  if (region) filter.region = region;
  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ name: match }, { city: match }, { memberNumber: match }, { "emails.general": match }];
  }

  const [items, total] = await Promise.all([
    Hotel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Hotel.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Hotels fetched successfully", toPage(items, total, page, limit));
});

/** Short list of all hotels for dropdowns (jobs, vouchers). */
export const hotelOptions = asyncHandler(async (_req: Request, res: Response) => {
  const hotels = await Hotel.find().select("name city memberNumber isActive emails").sort({ name: 1 }).lean();
  return ApiResponse(res, 200, "Hotels fetched successfully", hotels);
});

export const adminGetHotel = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id).lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");
  const [vacancies, vouchers] = await Promise.all([
    Vacancy.countDocuments({ hotel: hotel._id }),
    Voucher.countDocuments({ hotel: hotel._id }),
  ]);
  return ApiResponse(res, 200, "Hotel fetched successfully", { ...hotel, counts: { vacancies, vouchers } });
});

export const createHotel = asyncHandler(async (req: Request, res: Response) => {
  const data = pick(req.body, HOTEL_EDITABLE);
  const hotel = await Hotel.create({
    ...data,
    emails: req.body.emails,
    slug: await uniqueSlug(Hotel, req.body.name),
    memberNumber: await nextMemberNumber("hotel"),
  });
  return ApiResponse(res, 201, "Hotel created successfully", hotel);
});

export const updateHotel = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  hotel.set(pick(req.body, HOTEL_EDITABLE));
  if (req.body.emails) {
    for (const key of ["general", "invoices", "vacancies", "faults", "alerts"] as const) {
      if (req.body.emails[key] !== undefined) hotel.set(`emails.${key}`, req.body.emails[key]);
    }
  }
  await hotel.save();
  return ApiResponse(res, 200, "Hotel updated successfully", hotel);
});

/** Deletes the hotel with its jobs, vouchers, registers and logins (and photos). */
export const deleteHotel = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const vouchers = await Voucher.find({ hotel: hotel._id }).select("imageKey").lean();
  // Reviews by this hotel go too, and the suppliers' rankings follow.
  const reviewedSuppliers = await Review.find({ hotel: hotel._id }).distinct("supplier");
  await Review.deleteMany({ hotel: hotel._id });
  await Promise.all(reviewedSuppliers.map((id) => recalculateSupplierRating(id)));
  await Promise.all([
    Vacancy.deleteMany({ hotel: hotel._id }),
    Voucher.deleteMany({ hotel: hotel._id }),
    Contract.deleteMany({ hotel: hotel._id }),
    Permit.deleteMany({ hotel: hotel._id }),
    PortalLink.deleteMany({ hotel: hotel._id }),
    Notification.deleteMany({ hotel: hotel._id }),
    deleteHotelParticipations(hotel._id),
    Tender.find({ hotel: hotel._id }).distinct("_id").then((ids) => Promise.all([Offer.deleteMany({ tender: { $in: ids } }), Tender.deleteMany({ _id: { $in: ids } })])),
    FaultContact.deleteMany({ hotel: hotel._id }),
    User.deleteMany({ hotel: hotel._id, role: { $in: HOTEL_ROLES } }),
  ]);
  await hotel.deleteOne();
  await Promise.all([hotel.imageKey, ...vouchers.map((v) => v.imageKey)].map((key) => deleteFromSpaces(key)));

  return ApiResponse(res, 200, "Hotel deleted successfully");
});

export const uploadHotelImage = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new ApiError(404, "Hotel not found");
  await replaceImage(hotel, req.file, { field: "image", keyField: "imageKey", folder: "hotels" });
  return ApiResponse(res, 200, "Photo updated successfully", hotel);
});

export const deleteHotelImage = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new ApiError(404, "Hotel not found");
  await removeImage(hotel, { field: "image", keyField: "imageKey" });
  return ApiResponse(res, 200, "Photo removed successfully", hotel);
});

// ── Admin: the hotel's logins ───────────────────────────────────────────────
// Briefing §3.1: the first hotels are set up by HotelConnect. An admin makes
// the hotel manager's login here; the manager makes the staff login.

export const listHotelUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.find({ hotel: req.params.id, role: { $in: HOTEL_ROLES } })
    .select("firstName lastName email role isActive createdAt")
    .sort({ role: 1, createdAt: 1 })
    .lean();
  return ApiResponse(res, 200, "Logins fetched successfully", users);
});

export const createHotelManager = asyncHandler(async (req: Request, res: Response) => {
  const hotel = await Hotel.findById(req.params.id).select("_id").lean();
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const { firstName, lastName, email, password } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, "Email is already registered");

  const user = await User.create({ firstName, lastName, email, password, role: "hotel_manager", hotel: hotel._id });
  return ApiResponse(res, 201, "Hotel manager login created", user);
});

export const deleteHotelUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOneAndDelete({ _id: req.params.userId, hotel: req.params.id, role: { $in: HOTEL_ROLES } });
  if (!user) throw new ApiError(404, "Login not found");
  return ApiResponse(res, 200, "Login removed");
});
