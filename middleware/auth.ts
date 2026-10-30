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
