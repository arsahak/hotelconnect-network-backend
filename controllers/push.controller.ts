import type { Request, Response } from "express";
import { env } from "../config/env";
import { PushSubscription } from "../models/pushSubscription.model";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { pushEnabled, pushToUsers } from "../utils/push";

// Push notifications for the dashboard PWA.

/** GET /push/public-key — the VAPID key the browser needs to subscribe ("" = push off). */
export const getPublicKey = (_req: Request, res: Response) =>
  ApiResponse(res, 200, "Push key", { publicKey: pushEnabled() ? env.vapid.publicKey : "" });

/** POST /push/subscribe — remembers this device for the signed-in user and sends a test push. */
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  if (!pushEnabled()) throw new ApiError(503, "Push notifications are not set up yet");
  const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: req.user!._id, endpoint, keys, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await pushToUsers([req.user!._id], { title: "Push notifications are on", body: "You will get a notification here for new meldingen.", link: "/notifications" });
  return ApiResponse(res, 201, "Push notifications are on for this device");
});

/** DELETE /push/subscribe — forgets this device. */
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  await PushSubscription.deleteOne({ endpoint: String(req.body.endpoint), user: req.user!._id });
  return ApiResponse(res, 200, "Push notifications are off for this device");
});
