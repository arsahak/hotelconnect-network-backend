import mongoose, { Schema, Document } from "mongoose";

/**
 * A named running number, e.g. "hotel" → 12 means the last hotel got H0012.
 * Incremented atomically, so two sign-ups at the same moment never share a number.
 */
export interface ICounter extends Document<string> {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export const Counter = mongoose.model<ICounter>("Counter", counterSchema);
