import mongoose, { Schema, Document } from "mongoose";

/** How long an admin has to enter the emailed sign-in code. */
export const TWO_FACTOR_TTL_MINUTES = 10;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;
export const TWO_FACTOR_CODE_LENGTH = 6;

/**
 * Second sign-in step for admins (briefing §7: 2FA for beheerders). After
 * the right password an emailed code is needed; only hashes are stored.
 */
export interface ILoginChallenge extends Document {
  challengeHash: string;
  user: mongoose.Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

const loginChallengeSchema = new Schema<ILoginChallenge>({
  challengeHash: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginChallenge = mongoose.model<ILoginChallenge>("LoginChallenge", loginChallengeSchema);
