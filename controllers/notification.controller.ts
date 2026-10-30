import type { NextFunction, Request, Response } from "express";
import { Notification } from "../models/notification.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";

// The dashboard inbox (briefing §3.12, §4.4): a hotel manager sees the
// hotel's meldingen, a supplier the supplier's.

const LIST_SIZE = 50;

/** Whose inbox: { hotel } or { supplier }. Set on res.locals by `inboxOwner`. */
const owner = (res: Response) => res.locals.inboxOwner as Record<string, unknown>;

export const inboxOwner = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  if (user.role === "hotel_manager" && user.hotel) res.locals.inboxOwner = { hotel: user.hotel };
  else if (user.role === "supplier" && user.supplier) res.locals.inboxOwner = { supplier: user.supplier };
  else return next(new ApiError(403, "This account has no inbox"));
  next();
};

/** The newest 50 meldingen and how many are unread. ?unread=true for unread only. */
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...owner(res) };
  if (req.query.unread === "true") filter.readAt = null;
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(LIST_SIZE).lean(),
    Notification.countDocuments({ ...owner(res), readAt: null }),
  ]);
  return ApiResponse(res, 200, "Notifications fetched successfully", { items, unread });
});

export const unreadCount = asyncHandler(async (_req: Request, res: Response) => {
  const unread = await Notification.countDocuments({ ...owner(res), readAt: null });
  return ApiResponse(res, 200, "Unread count fetched", { unread });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...owner(res), readAt: null },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification && !(await Notification.exists({ _id: req.params.id, ...owner(res) }))) {
    throw new ApiError(404, "Notification not found");
  }
  return ApiResponse(res, 200, "Marked as read");
});

export const markAllRead = asyncHandler(async (_req: Request, res: Response) => {
  const result = await Notification.updateMany({ ...owner(res), readAt: null }, { readAt: new Date() });
  return ApiResponse(res, 200, "All marked as read", { updated: result.modifiedCount });
});
