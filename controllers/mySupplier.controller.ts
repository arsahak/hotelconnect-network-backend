import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { pick } from "../utils/pick";
import { removeImage, replaceImage } from "../utils/replaceImage";

// The signed-in supplier's own profile (briefing §4.2, §4.7). supplierOnly
// has already loaded req.supplier.

const EDITABLE = ["tagline", "description", "categories", "regions", "website", "certificates"] as const;
const LOGO = { field: "logo", keyField: "logoKey", folder: "suppliers/logos" } as const;

export const getMySupplier = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse(res, 200, "Profile fetched successfully", req.supplier);
});

export const updateMySupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = req.supplier!;
  supplier.set(pick(req.body, EDITABLE));
  for (const group of ["contact", "emails"] as const) {
    const values = req.body[group];
    if (!values) continue;
    for (const key of Object.keys(values)) {
      if (["person", "email", "phone", "invoices", "notifications"].includes(key)) supplier.set(`${group}.${key}`, values[key]);
    }
  }
  await supplier.save();
  return ApiResponse(res, 200, "Profile saved successfully", supplier);
});

/** PUT /my-supplier/logo (field "image") */
export const uploadMyLogo = asyncHandler(async (req: Request, res: Response) => {
  await replaceImage(req.supplier!, req.file, LOGO);
  return ApiResponse(res, 200, "Logo updated successfully", req.supplier);
});

export const deleteMyLogo = asyncHandler(async (req: Request, res: Response) => {
  await removeImage(req.supplier!, LOGO);
  return ApiResponse(res, 200, "Logo removed successfully", req.supplier);
});
