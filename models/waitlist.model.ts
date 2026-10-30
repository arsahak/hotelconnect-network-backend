import mongoose, { Schema, Document } from "mongoose";
import { EMAIL_REGEX } from "./user.model";

export const WAITLIST_TYPES = ["hotel", "supplier"] as const;

/** Test phase: people who want to hear when sign-ups open (briefing §1). */
export interface IWaitlistEntry extends Document {
  email: string;
  type: (typeof WAITLIST_TYPES)[number];
  createdAt: Date;
}

const waitlistSchema = new Schema<IWaitlistEntry>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [EMAIL_REGEX, "Please enter a valid email address"],
    },
    type: { type: String, enum: WAITLIST_TYPES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const WaitlistEntry = mongoose.model<IWaitlistEntry>("WaitlistEntry", waitlistSchema);
