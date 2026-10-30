import mongoose, { Schema, Document } from "mongoose";

// One in-flight "forgot password" request per account. It moves through two
// stages: an OTP is sent and must be confirmed, then a one-time reset token
// (handed out on confirmation) authorizes setting the new password.
export interface IPasswordReset extends Document {
  // Lower-cased email address of the account — the lookup key.
  identifier: string;
  user: mongoose.Types.ObjectId;
  otpHash: string;
  otpExpiresAt: Date;
  // Wrong OTP guesses so far; the request is discarded at OTP_MAX_ATTEMPTS.
  attempts: number;
  lastSentAt: Date;
  // Set once the OTP has been confirmed. Only the token's SHA-256 is stored.
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  // When this record stops being useful (OTP expiry, then token expiry) —
  // drives the TTL cleanup below.
  expiresAt: Date;
  createdAt: Date;
}

const passwordResetSchema = new Schema<IPasswordReset>(
  {
    identifier: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    resetTokenHash: { type: String },
    resetTokenExpiresAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-cleanup: MongoDB removes the document 5 minutes after expiresAt,
// leaving a short grace window to answer "expired" rather than "not found".
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 300 });

export const PasswordReset = mongoose.model<IPasswordReset>(
  "PasswordReset",
  passwordResetSchema
);
