import type { NextFunction, Request, Response } from "express";
import { getFeatures, type FeatureKey } from "../models/setting.model";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "./asyncHandler";

/**
 * Master Briefing v4: Phase 2 features stay in the code but are switched off
 * (feature flags). While off, their API answers 404, as if it isn't there.
 */
export const requireFeature = (key: FeatureKey) =>
  asyncHandler(async (_req: Request, _res: Response, next: NextFunction) => {
    if (!(await getFeatures())[key]) throw new ApiError(404, "This feature is not available yet");
    next();
  });
