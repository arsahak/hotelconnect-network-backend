import type { Request, Response } from "express";
import { publicSupplier, Supplier, SUPPLIER_PUBLIC_FIELDS } from "../models/supplier.model";
import { Notification } from "../models/notification.model";
import { Review } from "../models/review.model";
import { User } from "../models/user.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { containsRegex, pagination, queryString, toPage } from "../utils/listQuery";
import { nextMemberNumber } from "../utils/memberNumber";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";
import { uniqueSlug } from "../utils/slugify";
import { deleteFromSpaces } from "../utils/uploadToSpaces";
import { deleteSupplierFiles } from "../utils/memberFiles";
import { deleteSupplierParticipations } from "./purchase.controller";

const NATIONWIDE = "All of the Netherlands";

// ── Public: supplier directory, homepage slideshow, purchasing page ──────────
// Contact details are never included (briefing §2.4: members only).

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 24);
  const q = queryString(req, "q");
  const category = queryString(req, "category");
  const region = queryString(req, "region");

  const filter: Record<string, unknown> = { isActive: true };
  if (category) filter.categories = category;
  // A supplier working nationwide also serves every province.
  if (region) filter.regions = region === NATIONWIDE ? NATIONWIDE : { $in: [region, NATIONWIDE] };
  if (req.query.featured === "true") filter.featured = true;
  if (req.query.purchasing === "true") filter.showInPurchasing = true;
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ name: match }, { tagline: match }, { description: match }];
  }

  const [items, total] = await Promise.all([
    Supplier.find(filter)
      .select(SUPPLIER_PUBLIC_FIELDS)
      // Briefing §3.8: good reviews move a supplier up.
      .sort({ featured: -1, "rating.score": -1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Supplier.countDocuments(filter),
  ]);

  return ApiResponse(res, 200, "Suppliers fetched successfully", toPage(items.map(publicSupplier), total, page, limit));
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.findOne({ slug: req.params.slug, isActive: true })
    .select(SUPPLIER_PUBLIC_FIELDS)
    .lean();
  if (!supplier) throw new ApiError(404, "Supplier not found");
  return ApiResponse(res, 200, "Supplier fetched successfully", publicSupplier(supplier));
});

// ── Admin: manage suppliers (admin / superadmin) ────────────────────────────

const SUPPLIER_EDITABLE = [
  "name",
  "tagline",
  "description",
  "city",
  "country",
  "categories",
  "regions",
  "website",
  "plan",
  "kvkNumber",
  "featured",
  "showInPurchasing",
  "isActive",
] as const;

/** The two pictures a supplier has: the square logo and the large photo. */
const PICTURES = {
  logo: { field: "logo", keyField: "logoKey", folder: "suppliers/logos" },
  image: { field: "image", keyField: "imageKey", folder: "suppliers/photos" },
} as const;
type Picture = keyof typeof PICTURES;

export const adminListSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = pagination(req, 20);
  const q = queryString(req, "q");
  const category = queryString(req, "category");

  const filter: Record<string, unknown> = {};
  if (category) filter.categories = category;
  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;
  if (q) {
    const match = containsRegex(q);
    filter.$or = [{ name: match }, { memberNumber: match }, { "contact.email": match }, { "contact.person": match }];
  }

  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(filter),
  ]);
  return ApiResponse(res, 200, "Suppliers fetched successfully", toPage(items, total, page, limit));
});

export const adminGetSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.findById(req.params.id).lean();
  if (!supplier) throw new ApiError(404, "Supplier not found");
  return ApiResponse(res, 200, "Supplier fetched successfully", supplier);
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.create({
    ...pick(req.body, SUPPLIER_EDITABLE),
    contact: req.body.contact,
    slug: await uniqueSlug(Supplier, req.body.name),
    memberNumber: await nextMemberNumber("supplier"),
  });
  return ApiResponse(res, 201, "Supplier created successfully", supplier);
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new ApiError(404, "Supplier not found");

  supplier.set(pick(req.body, SUPPLIER_EDITABLE));
  if (req.body.contact) {
    for (const key of ["person", "email", "phone"] as const) {
      if (req.body.contact[key] !== undefined) supplier.set(`contact.${key}`, req.body.contact[key]);
    }
  }
  await supplier.save();
  return ApiResponse(res, 200, "Supplier updated successfully", supplier);
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new ApiError(404, "Supplier not found");
  // Quote files, job photos and avatars first, while their records still exist.
  await deleteSupplierFiles(supplier._id);
  await supplier.deleteOne();
  await Promise.all([
    User.deleteMany({ supplier: supplier._id, role: "supplier" }),
    Review.deleteMany({ supplier: supplier._id }),
    Notification.deleteMany({ supplier: supplier._id }),
    deleteSupplierParticipations(supplier._id),
    deleteFromSpaces(supplier.logoKey),
    deleteFromSpaces(supplier.imageKey),
  ]);
  return ApiResponse(res, 200, "Supplier deleted successfully");
});

/** PUT /suppliers/admin/:id/logo or /image */
export const uploadSupplierPicture = (picture: Picture) =>
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, "Supplier not found");
    await replaceImage(supplier, req.file, PICTURES[picture]);
    return ApiResponse(res, 200, `${picture === "logo" ? "Logo" : "Photo"} updated successfully`, supplier);
  });

export const deleteSupplierPicture = (picture: Picture) =>
  asyncHandler(async (req: Request, res: Response) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new ApiError(404, "Supplier not found");
    await removeImage(supplier, PICTURES[picture]);
    return ApiResponse(res, 200, `${picture === "logo" ? "Logo" : "Photo"} removed successfully`, supplier);
  });

// ── Admin: the supplier's logins ─────────────────────────────────────────────
// Briefing §4.1: the first suppliers are set up by HotelConnect. An admin makes
// their login here; with it they sign in to the dashboard and can book
// vouchers on the website (§2.4).

export const listSupplierUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await User.find({ supplier: req.params.id, role: "supplier" })
    .select("firstName lastName email role isActive createdAt")
    .sort({ createdAt: 1 })
    .lean();
  return ApiResponse(res, 200, "Logins fetched successfully", users);
});

export const createSupplierLogin = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await Supplier.findById(req.params.id).select("_id").lean();
  if (!supplier) throw new ApiError(404, "Supplier not found");

  const { firstName, lastName, email, password } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, "Email is already registered");

  const user = await User.create({ firstName, lastName, email, password, role: "supplier", supplier: supplier._id });
  return ApiResponse(res, 201, "Supplier login created", user);
});

export const deleteSupplierUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOneAndDelete({ _id: req.params.userId, supplier: req.params.id, role: "supplier" });
  if (!user) throw new ApiError(404, "Login not found");
  return ApiResponse(res, 200, "Login removed");
});
