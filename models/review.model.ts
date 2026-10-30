import mongoose, { Schema, Document } from "mongoose";

/**
 * Kwaliteitsformulier (briefing §3.8): after a job the hotel rates the
 * supplier it chose. One review per tender; the results decide the
 * suppliers' ranking.
 */
export interface IReview extends Document {
  tender: mongoose.Types.ObjectId;
  hotel: mongoose.Types.ObjectId;
  supplier: mongoose.Types.ObjectId;
  /** Overall rating, 1–5. */
  rating: number;
  onTime: boolean;
  /** Communication, 1–5. */
  communication: number;
  wouldHireAgain: boolean;
  comments: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         rating: { type: integer, minimum: 1, maximum: 5 }
 *         onTime: { type: boolean }
 *         communication: { type: integer, minimum: 1, maximum: 5 }
 *         wouldHireAgain: { type: boolean }
 *         comments: { type: string }
 */
const reviewSchema = new Schema<IReview>(
  {
    tender: { type: Schema.Types.ObjectId, ref: "Tender", required: true, unique: true },
    hotel: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    onTime: { type: Boolean, required: true },
    communication: { type: Number, required: true, min: 1, max: 5 },
    wouldHireAgain: { type: Boolean, required: true },
    comments: { type: String, trim: true, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

export const Review = mongoose.model<IReview>("Review", reviewSchema);
