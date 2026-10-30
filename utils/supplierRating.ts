import mongoose from "mongoose";
import { Review } from "../models/review.model";
import { Supplier } from "../models/supplier.model";

// The ranking score is a weighted average that starts at PRIOR_MEAN and
// moves towards the real average as reviews come in. One 5-star review alone
// doesn't put a new supplier above one with many good reviews.
const PRIOR_MEAN = 3.5;
const PRIOR_WEIGHT = 3;

/**
 * Per review: the overall rating counts most; communication, being on time
 * and "would hire again" adjust it a little. Always between 1 and 5.
 */
function reviewPoints(r: { rating: number; communication: number; onTime: boolean; wouldHireAgain: boolean }) {
  const points = 0.6 * r.rating + 0.2 * r.communication + 0.1 * (r.onTime ? 5 : 1) + 0.1 * (r.wouldHireAgain ? 5 : 1);
  return Math.min(5, Math.max(1, points));
}

/** Recalculates one supplier's rating from all its reviews. */
export async function recalculateSupplierRating(supplierId: mongoose.Types.ObjectId | string) {
  const reviews = await Review.find({ supplier: supplierId }).select("rating communication onTime wouldHireAgain").lean();
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const points = reviews.reduce((sum, r) => sum + reviewPoints(r), 0);
  const score = (PRIOR_MEAN * PRIOR_WEIGHT + points) / (PRIOR_WEIGHT + count);
  await Supplier.updateOne(
    { _id: supplierId },
    { rating: { average: Math.round(average * 10) / 10, count, score: Math.round(score * 1000) / 1000 } }
  );
}
