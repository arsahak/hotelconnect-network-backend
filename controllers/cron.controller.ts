import crypto from "crypto";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { runScheduledJobs } from "../utils/reminders";

/** Compares without leaking the secret through timing. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * GET /cron/daily — run the scheduled jobs (reminders, invoice clean-up).
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; nobody else may call it.
 */
export const runDaily = asyncHandler(async (req: Request, res: Response) => {
  if (!env.cronSecret) throw new ApiError(503, "CRON_SECRET is not set");
  if (!sameSecret(String(req.headers.authorization ?? ""), `Bearer ${env.cronSecret}`)) throw new ApiError(401, "Not allowed");
  const result = await runScheduledJobs();
  return ApiResponse(res, 200, "Scheduled jobs done", result);
});
