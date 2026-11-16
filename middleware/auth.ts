import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Supplier } from "../models/supplier.model";
import { User, type UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "./asyncHandler";
import type { TokenPayload } from "../utils/generateToken";

export const protect = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Not authenticated");
    }

    const token = header.split(" ")[1];

    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    } catch {
      throw new ApiError(401, "Invalid or expired token");
    }

    const user = await User.findById(payload.id);
    if (!user) {
      throw new ApiError(401, "User no longer exists");
    }
    if (!user.isActive) {
      throw new ApiError(403, "Your account is inactive");
    }

    req.user = user;
    next();
  }
);

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action")
      );
    }
    next();
  };

/** Signed in as a platform admin (admin or superadmin). */
export const adminOnly = [protect, authorize("admin", "superadmin")];

/**
 * Signed in with one of `roles` AND linked to a hotel. The controllers then
 * only ever read and write that hotel's records (req.user.hotel).
 */
export const hotelOnly = (...roles: UserRole[]) => [
  protect,
  authorize(...roles),
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.hotel) return next(new ApiError(403, "This account is not linked to a hotel"));
    next();
  },
];

/**
 * Signed in as a supplier whose supplier profile exists and is active.
 * Sets req.supplier for the controllers.
 */
export const supplierOnly = [
  protect,
  authorize("supplier"),
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const supplier = req.user?.supplier ? await Supplier.findById(req.user.supplier) : null;
    if (!supplier) throw new ApiError(403, "This account is not linked to a supplier");
    if (!supplier.isActive) throw new ApiError(403, "This supplier membership is not active");
    req.supplier = supplier;
    next();
  }),
];

/**
 * Features for hotels and suppliers with a subscription (client, 31 Oct):
 * hotel managers, and suppliers with a maintenance contract — not one-time
 * contractors. Sets req.supplier for suppliers.
 */
const subscribedMember = (feature: string) => [
  protect,
  authorize("hotel_manager", "supplier"),
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user!.role === "supplier") {
      const supplier = req.user?.supplier ? await Supplier.findById(req.user.supplier) : null;
      if (!supplier || !supplier.isActive) throw new ApiError(403, "This supplier membership is not active");
      if (supplier.plan !== "contract") throw new ApiError(403, `${feature} is for suppliers with a maintenance contract`);
      req.supplier = supplier;
    } else if (!req.user!.hotel) throw new ApiError(403, "This account is not linked to a hotel");
    next();
  }),
];

/** Collective purchasing. */
export const purchasingMember = subscribedMember("Collective purchasing");
/** Posting jobs. */
export const vacancyOwner = subscribedMember("Posting jobs");

/**
 * Public routes that show more to a signed-in supplier (Master Briefing v4:
 * the hotel name and contact email of a tender). Never fails: without a valid
 * supplier token the request simply stays anonymous.
 */
export const optionalSupplier = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.split(" ")[1], env.jwtSecret) as TokenPayload;
      const user = await User.findById(payload.id);
      if (user?.isActive && user.role === "supplier" && user.supplier) {
        const supplier = await Supplier.findById(user.supplier);
        if (supplier?.isActive) {
          req.user = user;
          req.supplier = supplier;
        }
      }
    } catch {
      // Expired or wrong token: carry on as a visitor.
    }
  }
  next();
});
